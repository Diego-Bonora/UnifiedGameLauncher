import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'
import { STEAM_CHANNELS } from '@shared/ipc/steam-channels'

// Deliberately not exposing Electron's generic ipcRenderer: the renderer gets
// only the named functions listed in RendererApi.
const api: RendererApi = {
  steam: {
    getInstalledGames: () => ipcRenderer.invoke(STEAM_CHANNELS.getInstalledGames),
    launch: (appId) => ipcRenderer.invoke(STEAM_CHANNELS.launch, { appId }),
    signIn: () => ipcRenderer.invoke(STEAM_CHANNELS.signIn),
    cancelSignIn: () => ipcRenderer.invoke(STEAM_CHANNELS.cancelSignIn),
    disconnect: () => ipcRenderer.invoke(STEAM_CHANNELS.disconnect),
    getConnectionStatus: () => ipcRenderer.invoke(STEAM_CHANNELS.getConnectionStatus),
    setApiKey: (apiKey) => ipcRenderer.invoke(STEAM_CHANNELS.setApiKey, { apiKey }),
    clearApiKey: () => ipcRenderer.invoke(STEAM_CHANNELS.clearApiKey),
    getOwnedGames: () => ipcRenderer.invoke(STEAM_CHANNELS.getOwnedGames),
    getCachedLibrary: () => ipcRenderer.invoke(STEAM_CHANNELS.getCachedLibrary)
  }
}

contextBridge.exposeInMainWorld('api', api)
