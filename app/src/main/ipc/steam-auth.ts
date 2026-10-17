import {
  STEAM_CHANNELS,
  steamApiKeyPayloadSchema,
  type SteamConnectionStatus,
  type SteamLibraryFailure,
  type SteamLibraryResult,
  type SteamOwnedGame,
  type SteamSetApiKeyResult,
  type SteamConnectResult,
  type SteamDisconnectResult
} from '@shared/ipc/steam'
import { clearCovers, syncCovers, withLocalCoverUrls } from '../library/cover-cache'
import {
  clearCachedSteamLibrary,
  getCachedSteamLibrary,
  setCachedSteamLibrary
} from '../library/library-cache'
import { cancelSteamSignIn, openSteamSignInInBrowser } from '../stores/steam/openid'
import { getOwnedSteamGames, SteamApiError } from '../stores/steam/owned-games'
import {
  clearSteamConnection,
  getSteamConnection,
  setSteamConnection,
  type SteamConnection
} from '../storage/connection-store'
import { clearSecret, getSecret, setSecret } from '../storage/secret-store'
import { handleFromApp } from './app-handle'
import { notifyAllWindows } from './notify-windows'

// This app's only secret today; kept here (not in secret-store.ts, which
// stays store-agnostic) since only this file's handlers ever read or write it.
const STEAM_API_KEY_SECRET = 'steamApiKey'

// A separate registration function (and file) from ipc/steam.ts: this one
// pulls in the OpenID flow + connection/secret storage, keeping that import
// graph apart from the plain install-detection handlers.
async function loadSteamAuthState(): Promise<{
  connection: SteamConnection
  apiKey: string | null
}> {
  const [connection, apiKey] = await Promise.all([
    getSteamConnection(),
    getSecret(STEAM_API_KEY_SECRET)
  ])
  return { connection, apiKey }
}

async function buildConnectionStatus(): Promise<SteamConnectionStatus> {
  const { connection, apiKey } = await loadSteamAuthState()
  // Spread (not a hand-built object literal) preserves the discriminated
  // union: copying `status`/`steamId64` out separately would produce two
  // independent unions TS can no longer correlate with each other.
  return { ...connection, hasApiKey: apiKey !== null }
}

// Tells every open window that new covers are on disk. No payload: the
// window re-reads the library through the normal handler, which already
// returns the local URLs.
function notifyCoversChanged(): void {
  notifyAllWindows(STEAM_CHANNELS.coversChanged, 'steam')
}

async function fallBackToSavedLibrary(
  steamId64: string,
  problem: SteamLibraryFailure
): Promise<SteamLibraryResult> {
  const cached = await getCachedSteamLibrary(steamId64)
  if (cached !== null) {
    return { source: 'cache', games: await withLocalCoverUrls(cached), problem }
  }
  // Nothing saved either: report that as data, not as a thrown error (see
  // SteamLibraryResult), and let the renderer word it.
  return { source: 'none', games: null, problem }
}

// Bumped when a disconnect starts. A library read that began before it must
// not save the account's library again or start its cover downloads when
// Steam answers afterwards (docs/features/release.md, "Disconnect Steam").
let disconnectGeneration = 0
// The disconnect in progress, if any. Library reads wait for it, so one that
// starts meanwhile sees the connection as it is afterwards.
let disconnecting: Promise<unknown> = Promise.resolve()

// Resolves once no disconnect is running, to the generation a read must
// carry from here on. Loops because another disconnect may start while
// waiting for one; the generation is read in the same tick the wait ends, so
// a disconnect starting after that always changes it.
async function waitForDisconnects(): Promise<number> {
  for (;;) {
    const current = disconnecting
    await current
    if (current === disconnecting) return disconnectGeneration
  }
}

// What a read that was overtaken by a disconnect returns. The window started
// it for a connection that is gone and ignores the answer.
const OVERTAKEN: SteamLibraryResult = { source: 'none', games: null, problem: 'unavailable' }

// `generation` is taken before the read looked at the connection, so a
// disconnect that lands at any point after that is noticed.
async function loadLibrary(
  steamId64: string,
  apiKey: string,
  generation: number
): Promise<SteamLibraryResult> {
  let games: SteamOwnedGame[]
  try {
    games = await getOwnedSteamGames(steamId64, apiKey)
    if (generation !== disconnectGeneration) return OVERTAKEN
  } catch (err) {
    if (generation !== disconnectGeneration) return OVERTAKEN
    // Whatever the reason, the saved connection and API key stay exactly as
    // they are: a failed fetch (no connection, Steam having an outage, even
    // Steam refusing the key) is never a reason to delete them. The user
    // removes a bad key themselves.
    const problem: SteamLibraryFailure = err instanceof SteamApiError ? err.problem : 'unavailable'
    console.warn(`[steam] could not fetch owned games (${problem}):`, err)
    return fallBackToSavedLibrary(steamId64, problem)
  }

  // An empty answer must not replace a good saved library. A private profile,
  // an odd 200 body or a changed response shape all parse to "no games", and
  // overwriting would leave every later offline start showing an empty
  // library. A real library never shrinks to nothing, so keep the saved copy
  // and say so; with no saved copy the empty list is taken at face value.
  if (games.length === 0) {
    const cached = await getCachedSteamLibrary(steamId64)
    if (cached !== null && cached.length > 0) {
      console.warn('[steam] Steam returned an empty library; keeping the saved copy')
      return { source: 'cache', games: await withLocalCoverUrls(cached), problem: 'empty' }
    }
  }

  // Saving is best-effort: the user already has a good live result, so a
  // full disk or locked file must not turn it into an error. The cache
  // module has already logged the failure.
  // Checked again right before each step (there are awaits in between).
  // Done in the same tick as the call, so either the save is queued before
  // a disconnect's delete (which then removes it) or it isn't made at all.
  if (generation !== disconnectGeneration) return OVERTAKEN
  await setCachedSteamLibrary(steamId64, games).catch(() => undefined)
  if (generation !== disconnectGeneration) return OVERTAKEN
  // Not awaited: the grid must not wait on ~100 image downloads. They land on
  // disk for the NEXT load; this one uses whatever is already there and the
  // remote URL for the rest. syncCovers never rejects; when it finishes with
  // something new, the window is told so this session doesn't wait for a
  // restart to show the local copies.
  void syncCovers(games).then((downloaded) => {
    if (downloaded > 0) notifyCoversChanged()
  })
  return { source: 'live', games: await withLocalCoverUrls(games), problem: null }
}

// Overlapping calls (the renderer's retry timer, the browser's online event,
// a key change) share one Steam request instead of each starting their own:
// repeated triggers could otherwise burst into a 429, which would then be
// reported as the wrong problem. A call with a different account or key does
// not join, since its answer would be about something else. Held in memory
// only, for the length of one request.
// Nor does a call from after a disconnect join one from before it.
let inFlightLibrary: {
  steamId64: string
  apiKey: string
  generation: number
  promise: Promise<SteamLibraryResult>
} | null = null

function loadLibraryOnce(
  steamId64: string,
  apiKey: string,
  generation: number
): Promise<SteamLibraryResult> {
  if (
    inFlightLibrary !== null &&
    inFlightLibrary.steamId64 === steamId64 &&
    inFlightLibrary.apiKey === apiKey &&
    inFlightLibrary.generation === generation
  ) {
    return inFlightLibrary.promise
  }
  const entry = {
    steamId64,
    apiKey,
    generation,
    promise: loadLibrary(steamId64, apiKey, generation).finally(() => {
      // Identity check, as in openid.ts: only clear the slot if it is still
      // THIS request's, not a newer one's.
      if (inFlightLibrary === entry) inFlightLibrary = null
    })
  }
  inFlightLibrary = entry
  return entry.promise
}

// Deletes the account's data first and the connection last: if anything
// can't be deleted, the user is still connected and can press Disconnect
// again. Never touches the API key (auth-roles.md).
async function disconnectSteam(): Promise<SteamDisconnectResult> {
  disconnectGeneration++
  // A request in flight must not be joined by a read after a reconnect.
  inFlightLibrary = null
  let problem: SteamDisconnectResult['problem'] = null
  try {
    // The library cache queues its writes, so a save that started before
    // this point lands first and is then removed.
    await clearCachedSteamLibrary()
    await clearCovers()
    await clearSteamConnection()
  } catch (err) {
    console.warn('[steam] could not remove all Steam data on disconnect:', err)
    problem = 'removeFailed'
  }
  return { connection: await buildConnectionStatus(), problem }
}

// Every channel here reads or changes the account's saved data, so only the
// app's own page may call it.
export function registerSteamAuthIpc(): void {
  handleFromApp(STEAM_CHANNELS.getConnectionStatus, async () => {
    return buildConnectionStatus()
  })

  handleFromApp(STEAM_CHANNELS.signIn, async (): Promise<SteamConnectResult> => {
    const result = await openSteamSignInInBrowser()
    let problem: SteamConnectResult['problem'] = null
    if ('steamId64' in result) {
      try {
        await setSteamConnection({ status: 'connected', steamId64: result.steamId64 })
      } catch (err) {
        console.warn('[steam] could not save the Steam connection:', err)
        problem = 'cannotSave'
      }
    } else if ('failed' in result) {
      problem = 'verifyFailed'
    }
    // A cancelled or failed sign-in leaves any existing connection untouched;
    // the renderer gets whatever is saved now.
    return { connection: await buildConnectionStatus(), problem }
  })

  handleFromApp(STEAM_CHANNELS.cancelSignIn, () => {
    cancelSteamSignIn()
  })

  handleFromApp(STEAM_CHANNELS.disconnect, async (): Promise<SteamDisconnectResult> => {
    const run = disconnectSteam()
    disconnecting = run.catch(() => undefined)
    return run
  })

  handleFromApp(
    STEAM_CHANNELS.setApiKey,
    async (_event, rawPayload: unknown): Promise<SteamSetApiKeyResult> => {
      const result = steamApiKeyPayloadSchema.safeParse(rawPayload)
      if (!result.success) return { saved: false, reason: 'invalidKey' }
      try {
        await setSecret(STEAM_API_KEY_SECRET, result.data.apiKey)
      } catch (err) {
        // safeStorage unavailable, or the secrets file couldn't be written.
        console.warn('[steam] could not save the Steam Web API key:', err)
        return { saved: false, reason: 'cannotStore' }
      }
      return { saved: true, connection: await buildConnectionStatus() }
    }
  )

  handleFromApp(STEAM_CHANNELS.clearApiKey, async () => {
    await clearSecret(STEAM_API_KEY_SECRET)
    return buildConnectionStatus()
  })

  handleFromApp(STEAM_CHANNELS.getOwnedGames, async () => {
    const generation = await waitForDisconnects()
    const { connection, apiKey } = await loadSteamAuthState()
    // The connection is deleted last, so a disconnect that started during
    // that read would still look connected.
    if (generation !== disconnectGeneration) return OVERTAKEN
    if (connection.status !== 'connected' || apiKey === null) {
      throw new Error('Connect Steam and add your Steam Web API key first.')
    }
    return loadLibraryOnce(connection.steamId64, apiKey, generation)
  })

  handleFromApp(STEAM_CHANNELS.getCachedLibrary, async () => {
    const generation = await waitForDisconnects()
    const connection = await getSteamConnection()
    if (generation !== disconnectGeneration || connection.status !== 'connected') return null
    const games = await getCachedSteamLibrary(connection.steamId64)
    return games === null
      ? null
      : { steamId64: connection.steamId64, games: await withLocalCoverUrls(games) }
  })
}
