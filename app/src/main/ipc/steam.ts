import { ipcMain, shell } from 'electron'
import { STEAM_CHANNELS } from '@shared/ipc/steam'
import { scanSteamInstall, steamProvider } from '../stores/steam'
import { handOffToSteam, listSteamInstalledGames } from './steam-handlers'

export function registerSteamIpc(): void {
  ipcMain.handle(STEAM_CHANNELS.getInstalledGames, () => listSteamInstalledGames(scanSteamInstall))

  ipcMain.handle(STEAM_CHANNELS.launch, (_event, rawRequest: unknown) =>
    handOffToSteam('launch', steamProvider, rawRequest, (url) => shell.openExternal(url))
  )

  ipcMain.handle(STEAM_CHANNELS.install, (_event, rawRequest: unknown) =>
    handOffToSteam('install', steamProvider, rawRequest, (url) => shell.openExternal(url))
  )
}
