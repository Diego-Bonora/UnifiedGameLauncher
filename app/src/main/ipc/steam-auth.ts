import { ipcMain } from 'electron'
import {
  STEAM_CHANNELS,
  steamApiKeyPayloadSchema,
  type SteamConnectionStatus,
  type SteamLibraryProblem,
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

// Shown only when there is NO saved library to fall back on; otherwise the
// library itself is shown and the renderer words the notice from `problem`.
const LIBRARY_PROBLEM_MESSAGES: Record<SteamLibraryProblem, string> = {
  offline:
    "You're offline, so your Steam library couldn't be loaded. It will load once you're back online.",
  keyRejected:
    "Steam didn't accept your Web API key. Check that it's correct, or remove it and add it again.",
  unavailable: 'Could not load your Steam library. Please try again later.'
}

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
    let games: SteamOwnedGame[]
    try {
      games = await getOwnedSteamGames(connection.steamId64, apiKey)
    } catch (err) {
      // Whatever the reason, the saved connection and API key stay exactly
      // as they are: a failed fetch (no connection, Steam having an outage,
      // even Steam refusing the key) is never a reason to delete them. The
      // user removes a bad key themselves.
      const problem = err instanceof SteamApiError ? err.problem : 'unavailable'
      console.warn(`[steam] could not fetch owned games (${problem}):`, err)

      // Fall back to the saved copy when there is one, so the library still
      // shows; the renderer uses `problem` to say why it is a saved copy.
      const cached = await getCachedSteamLibrary(connection.steamId64)
      if (cached !== null) {
        return {
          source: 'cache',
          games: await withLocalCoverUrls(cached),
          problem
        } satisfies SteamLibraryResult
      }
      // Nothing saved to show: a friendly message, never the raw detail.
      throw new Error(LIBRARY_PROBLEM_MESSAGES[problem])
    }

    // Saving is best-effort: the user already has a good live result, so a
    // full disk or locked file must not turn it into an error. The cache
    // module has already logged the failure.
    await setCachedSteamLibrary(connection.steamId64, games).catch(() => undefined)
    // Not awaited: the grid must not wait on ~100 image downloads. They land
    // on disk for the NEXT load; this one uses whatever is already there and
    // the remote URL for the rest. syncCovers never rejects.
    void syncCovers(games)
    return {
      source: 'live',
      games: await withLocalCoverUrls(games),
      problem: null
    } satisfies SteamLibraryResult
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
