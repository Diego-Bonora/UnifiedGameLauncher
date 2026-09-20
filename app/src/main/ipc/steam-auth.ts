import { ipcMain } from 'electron'
import {
  STEAM_CHANNELS,
  steamApiKeyPayloadSchema,
  type SteamConnectionStatus
} from '@shared/ipc/steam'
import { cancelSteamSignIn, openSteamSignInInBrowser } from '../stores/steam/openid'
import {
  clearSteamConnection,
  getSteamConnection,
  setSteamConnection
} from '../storage/connection-store'
import { clearSecret, getSecret, setSecret } from '../storage/secret-store'

// This app's only secret today; kept here (not in secret-store.ts, which
// stays store-agnostic) since only this file's handlers ever read or write it.
const STEAM_API_KEY_SECRET = 'steamApiKey'

// A separate registration function (and file) from ipc/steam.ts: this one
// pulls in the OpenID flow + connection/secret storage, keeping that import
// graph apart from the plain install-detection handlers.
async function buildConnectionStatus(): Promise<SteamConnectionStatus> {
  const [connection, apiKey] = await Promise.all([
    getSteamConnection(),
    getSecret(STEAM_API_KEY_SECRET)
  ])
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
}
