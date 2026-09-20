import { ipcMain } from 'electron'
import {
  STEAM_CHANNELS,
  steamApiKeyPayloadSchema,
  type SteamConnectionStatus
} from '@shared/ipc/steam'
import { downloadMissingCovers, withLocalCoverUrls } from '../library/cover-cache'
import {
  clearCachedSteamLibrary,
  getCachedSteamLibrary,
  setCachedSteamLibrary
} from '../library/library-cache'
import { cancelSteamSignIn, openSteamSignInInBrowser } from '../stores/steam/openid'
import { getOwnedSteamGames } from '../stores/steam/owned-games'
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
    try {
      const games = await getOwnedSteamGames(connection.steamId64, apiKey)
      // Saving is best-effort: the user already has a good live result, so a
      // full disk or locked file must not turn it into an error. The cache
      // module has already logged the failure.
      await setCachedSteamLibrary(connection.steamId64, games).catch(() => undefined)
      // Not awaited: the grid must not wait on ~100 image downloads. They
      // land on disk for the NEXT load; this one uses whatever is already
      // there and the remote URL for the rest.
      downloadMissingCovers(games).catch(() => undefined)
      return await withLocalCoverUrls(games)
    } catch (err) {
      // A friendly, generic message — never the raw fetch/HTTP detail. The
      // saved connection and API key are left untouched: a failed fetch
      // (network down, Steam's API having an outage) isn't a reason to make
      // the user reconnect or re-enter their key.
      console.warn('[steam] could not fetch owned games:', err)
      throw new Error('Could not load your Steam library. Please try again later.')
    }
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
