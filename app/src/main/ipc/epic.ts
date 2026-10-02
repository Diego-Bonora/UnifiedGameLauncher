import { ipcMain, shell } from 'electron'
import { EPIC_CHANNELS } from '@shared/ipc/epic'
import {
  getEpicCoverProblem,
  getLocalEpicCoverUrls,
  isEpicCoverBackoffActive,
  resetEpicCoverLookups,
  syncEpicCovers
} from '../library/epic-cover-cache'
import { clearSecret, getSecret, setSecret } from '../storage/secret-store'
import { epicProvider } from '../stores/epic'
import { createEpicCoverHandlers } from './epic-cover-handlers'
import { detectEpicAppNames, launchEpicGame, listEpicInstalledGames } from './epic-handlers'
import { notifyAllWindows } from './notify-windows'

// Only this file reads or writes the SteamGridDB key (see secret-store.ts:
// callers own their key names).
const STEAMGRIDDB_KEY_SECRET = 'steamGridDbApiKey'

export function registerEpicIpc(): void {
  const covers = createEpicCoverHandlers({
    getKey: () => getSecret(STEAMGRIDDB_KEY_SECRET),
    saveKey: (apiKey) => setSecret(STEAMGRIDDB_KEY_SECRET, apiKey),
    removeKey: () => clearSecret(STEAMGRIDDB_KEY_SECRET),
    detect: () => detectEpicAppNames(epicProvider),
    sync: (appNames, apiKey) => syncEpicCovers(appNames, apiKey),
    reset: () => resetEpicCoverLookups(),
    getProblem: getEpicCoverProblem,
    isBackoffActive: () => isEpicCoverBackoffActive(),
    localUrls: (appNames) => getLocalEpicCoverUrls(appNames),
    notify: () => notifyAllWindows(EPIC_CHANNELS.coversChanged, 'epic-covers')
  })

  ipcMain.handle(EPIC_CHANNELS.getInstalledGames, () =>
    listEpicInstalledGames(epicProvider, covers.listCovers)
  )
  ipcMain.handle(EPIC_CHANNELS.launch, (_event, rawRequest: unknown) =>
    launchEpicGame(epicProvider, rawRequest, (url) => shell.openExternal(url))
  )
  ipcMain.handle(EPIC_CHANNELS.getCoverStatus, () => covers.getStatus())
  ipcMain.handle(EPIC_CHANNELS.setCoverKey, (_event, rawRequest: unknown) =>
    covers.setKey(rawRequest)
  )
  ipcMain.handle(EPIC_CHANNELS.clearCoverKey, () => covers.clearKey())
}
