import { ipcMain, shell } from 'electron'
import {
  STEAM_CHANNELS,
  steamInstalledGameSchema,
  steamLaunchRequestSchema
} from '@shared/ipc/steam'
import { steamProvider } from '../stores/steam'
import { isAllowedExternalUrl } from '../security/external-url'

export function registerSteamIpc(): void {
  ipcMain.handle(STEAM_CHANNELS.getInstalledGames, async () => {
    const games = await steamProvider.getInstalledGames()
    // Actually enforced, not just declared: a malformed entry is dropped
    // rather than crashing the whole list, matching the parser's own
    // "one bad file shouldn't take down every other game" rule.
    return games.flatMap((game) => {
      const result = steamInstalledGameSchema.safeParse({
        appId: game.storeGameId,
        title: game.title,
        installPath: game.installPath
      })
      if (!result.success) {
        console.warn('[steam] dropped a malformed installed game:', result.error.message)
        return []
      }
      return [result.data]
    })
  })

  ipcMain.handle(STEAM_CHANNELS.launch, async (_event, rawRequest: unknown) => {
    const { appId } = steamLaunchRequestSchema.parse(rawRequest)
    const url = steamProvider.getLaunchUrl(appId)
    // Defensive: getLaunchUrl always builds a steam:// URL today, but this
    // keeps the allow-list the single source of truth if that ever changes.
    // Throwing (not silently returning) means the renderer always gets a
    // signal when a launch didn't happen, instead of a false "success".
    if (!isAllowedExternalUrl(url)) {
      throw new Error('This game cannot be launched right now.')
    }
    await shell.openExternal(url)
  })
}
