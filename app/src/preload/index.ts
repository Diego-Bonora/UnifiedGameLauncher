import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'
import { STEAM_CHANNELS } from '@shared/ipc/steam-channels'

// Deliberately not exposing Electron's generic ipcRenderer: the renderer gets
// only the named functions listed in RendererApi.
const api: RendererApi = {
  steam: {
    getInstalledGames: () => ipcRenderer.invoke(STEAM_CHANNELS.getInstalledGames),
    launch: (appId) => ipcRenderer.invoke(STEAM_CHANNELS.launch, { appId })
  }
}

contextBridge.exposeInMainWorld('api', api)
