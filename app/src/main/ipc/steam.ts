import { ipcMain, shell } from 'electron'
import { STEAM_CHANNELS } from '@shared/ipc/steam'
import {
  localSteamCoverUrls,
  noteInstalledSteamGames,
  syncInstalledCovers
} from '../library/cover-cache'
import { scanSteamInstall, steamProvider } from '../stores/steam'
import { notifyAllWindows } from './notify-windows'
import {
  handOffToSteam,
  listSteamInstalledGames,
  type SteamInstalledCovers
} from './steam-handlers'

const installedCovers: SteamInstalledCovers = {
  urlsFor: (appIds) => localSteamCoverUrls(appIds),
  onListed: (appIds) => {
    noteInstalledSteamGames(appIds)
    // Not awaited: the list must not wait on lookups and downloads. The
    // window re-reads when something new is saved; that read finds nothing
    // left to fetch, so it doesn't notify again.
    void syncInstalledCovers(appIds).then((saved) => {
      if (saved > 0) notifyAllWindows(STEAM_CHANNELS.coversChanged, 'steam')
    })
  }
}

export function registerSteamIpc(): void {
  ipcMain.handle(STEAM_CHANNELS.getInstalledGames, () =>
    listSteamInstalledGames(scanSteamInstall, installedCovers)
  )

  ipcMain.handle(STEAM_CHANNELS.launch, (_event, rawRequest: unknown) =>
    handOffToSteam('launch', steamProvider, rawRequest, (url) => shell.openExternal(url))
  )

  ipcMain.handle(STEAM_CHANNELS.install, (_event, rawRequest: unknown) =>
    handOffToSteam('install', steamProvider, rawRequest, (url) => shell.openExternal(url))
  )
}
