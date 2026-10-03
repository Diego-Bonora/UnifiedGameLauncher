import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'
import { EPIC_CHANNELS } from '@shared/ipc/epic-channels'
import { FAVORITES_CHANNELS } from '@shared/ipc/favorites-channels'
import { STEAM_CHANNELS } from '@shared/ipc/steam-channels'

// Deliberately not exposing Electron's generic ipcRenderer: the renderer gets
// only the named functions listed in RendererApi.
const api: RendererApi = {
  steam: {
    getInstalledGames: () => ipcRenderer.invoke(STEAM_CHANNELS.getInstalledGames),
    launch: (appId) => ipcRenderer.invoke(STEAM_CHANNELS.launch, { appId }),
    install: (appId) => ipcRenderer.invoke(STEAM_CHANNELS.install, { appId }),
    signIn: () => ipcRenderer.invoke(STEAM_CHANNELS.signIn),
    cancelSignIn: () => ipcRenderer.invoke(STEAM_CHANNELS.cancelSignIn),
    disconnect: () => ipcRenderer.invoke(STEAM_CHANNELS.disconnect),
    getConnectionStatus: () => ipcRenderer.invoke(STEAM_CHANNELS.getConnectionStatus),
    setApiKey: (apiKey) => ipcRenderer.invoke(STEAM_CHANNELS.setApiKey, { apiKey }),
    clearApiKey: () => ipcRenderer.invoke(STEAM_CHANNELS.clearApiKey),
    getOwnedGames: () => ipcRenderer.invoke(STEAM_CHANNELS.getOwnedGames),
    getCachedLibrary: () => ipcRenderer.invoke(STEAM_CHANNELS.getCachedLibrary),
    onCoversChanged: (callback) => {
      // The event object is deliberately not passed on: it would hand the
      // renderer a reference into Electron's IPC internals.
      const listener = (): void => callback()
      ipcRenderer.on(STEAM_CHANNELS.coversChanged, listener)
      return () => {
        ipcRenderer.removeListener(STEAM_CHANNELS.coversChanged, listener)
      }
    }
  },
  epic: {
    getInstalledGames: () => ipcRenderer.invoke(EPIC_CHANNELS.getInstalledGames),
    launch: (appName) => ipcRenderer.invoke(EPIC_CHANNELS.launch, { appName }),
    getCoverStatus: () => ipcRenderer.invoke(EPIC_CHANNELS.getCoverStatus),
    setCoverKey: (apiKey) => ipcRenderer.invoke(EPIC_CHANNELS.setCoverKey, { apiKey }),
    clearCoverKey: () => ipcRenderer.invoke(EPIC_CHANNELS.clearCoverKey),
    onCoversChanged: (callback) => {
      // Same as Steam's: the event object is not passed on.
      const listener = (): void => callback()
      ipcRenderer.on(EPIC_CHANNELS.coversChanged, listener)
      return () => {
        ipcRenderer.removeListener(EPIC_CHANNELS.coversChanged, listener)
      }
    }
  },
  favorites: {
    list: () => ipcRenderer.invoke(FAVORITES_CHANNELS.list),
    set: (store, id, favorite) =>
      ipcRenderer.invoke(FAVORITES_CHANNELS.set, { store, id, favorite })
  }
}

contextBridge.exposeInMainWorld('api', api)
