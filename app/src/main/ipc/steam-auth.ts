import { BrowserWindow, ipcMain } from 'electron'
import {
  STEAM_CHANNELS,
  steamApiKeyPayloadSchema,
  type SteamConnectionStatus,
  type SteamLibraryFailure,
  type SteamLibraryResult,
  type SteamOwnedGame
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
  for (const window of BrowserWindow.getAllWindows()) {
    // isDestroyed() can still be false for a window that is mid-teardown, and
    // send() then throws. This runs in a .then with nothing after it, so an
    // uncaught throw would be an unhandled rejection; and one bad window must
    // not stop the others from being told.
    try {
      if (!window.isDestroyed()) window.webContents.send(STEAM_CHANNELS.coversChanged)
    } catch (err) {
      console.warn('[steam] could not tell a window about new covers:', err)
    }
  }
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

async function loadLibrary(steamId64: string, apiKey: string): Promise<SteamLibraryResult> {
  let games: SteamOwnedGame[]
  try {
    games = await getOwnedSteamGames(steamId64, apiKey)
  } catch (err) {
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
  await setCachedSteamLibrary(steamId64, games).catch(() => undefined)
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
let inFlightLibrary: {
  steamId64: string
  apiKey: string
  promise: Promise<SteamLibraryResult>
} | null = null

function loadLibraryOnce(steamId64: string, apiKey: string): Promise<SteamLibraryResult> {
  if (
    inFlightLibrary !== null &&
    inFlightLibrary.steamId64 === steamId64 &&
    inFlightLibrary.apiKey === apiKey
  ) {
    return inFlightLibrary.promise
  }
  const entry = {
    steamId64,
    apiKey,
    promise: loadLibrary(steamId64, apiKey).finally(() => {
      // Identity check, as in openid.ts: only clear the slot if it is still
      // THIS request's, not a newer one's.
      if (inFlightLibrary === entry) inFlightLibrary = null
    })
  }
  inFlightLibrary = entry
  return entry.promise
}

export function registerSteamAuthIpc(): void {
  ipcMain.handle(STEAM_CHANNELS.getConnectionStatus, async () => {
    return buildConnectionStatus()
  })

  ipcMain.handle(STEAM_CHANNELS.signIn, async () => {
    const result = await openSteamSignInInBrowser()
    if ('steamId64' in result) {
      await setSteamConnection({ status: 'connected', steamId64: result.steamId64 })
    } else if ('failed' in result) {
      // A friendly, generic message — never the raw verification detail.
      throw new Error('Could not verify the response from Steam. Please try again.')
    }
    // A cancelled sign-in leaves any existing connection untouched — the
    // renderer just re-reads whatever was there.
    return buildConnectionStatus()
  })

  ipcMain.handle(STEAM_CHANNELS.cancelSignIn, () => {
    cancelSteamSignIn()
  })

  ipcMain.handle(STEAM_CHANNELS.disconnect, async () => {
    await clearSteamConnection()
    // Not swallowed: if the saved library can't be removed, the caller
    // should hear about it rather than assume it is gone.
    await clearCachedSteamLibrary()
    await clearCovers()
    return buildConnectionStatus()
  })

  ipcMain.handle(STEAM_CHANNELS.setApiKey, async (_event, rawPayload: unknown) => {
    const result = steamApiKeyPayloadSchema.safeParse(rawPayload)
    if (!result.success) {
      // A friendly, generic message — never the raw zod error.
      throw new Error(
        "That doesn't look like a Steam Web API key. It should be 32 letters and numbers."
      )
    }
    await setSecret(STEAM_API_KEY_SECRET, result.data.apiKey)
    return buildConnectionStatus()
  })

  ipcMain.handle(STEAM_CHANNELS.clearApiKey, async () => {
    await clearSecret(STEAM_API_KEY_SECRET)
    return buildConnectionStatus()
  })

  ipcMain.handle(STEAM_CHANNELS.getOwnedGames, async () => {
    const { connection, apiKey } = await loadSteamAuthState()
    if (connection.status !== 'connected' || apiKey === null) {
      throw new Error('Connect Steam and add your Steam Web API key first.')
    }
    return loadLibraryOnce(connection.steamId64, apiKey)
  })

  ipcMain.handle(STEAM_CHANNELS.getCachedLibrary, async () => {
    const connection = await getSteamConnection()
    if (connection.status !== 'connected') return null
    const games = await getCachedSteamLibrary(connection.steamId64)
    return games === null
      ? null
      : { steamId64: connection.steamId64, games: await withLocalCoverUrls(games) }
  })
}
