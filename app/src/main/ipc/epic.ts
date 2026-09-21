import { ipcMain, shell } from 'electron'
import { EPIC_CHANNELS } from '@shared/ipc/epic'
import { epicProvider } from '../stores/epic'
import { launchEpicGame, listEpicInstalledGames } from './epic-handlers'

export function registerEpicIpc(): void {
  ipcMain.handle(EPIC_CHANNELS.getInstalledGames, () => listEpicInstalledGames(epicProvider))
  ipcMain.handle(EPIC_CHANNELS.launch, (_event, rawRequest: unknown) =>
    launchEpicGame(epicProvider, rawRequest, (url) => shell.openExternal(url))
  )
}
