import { contextBridge } from 'electron'
import type { RendererApi } from '@shared/api'

// Deliberately not exposing Electron's generic ipcRenderer: the renderer gets
// only the named functions listed in RendererApi.
const api: RendererApi = {}

contextBridge.exposeInMainWorld('api', api)
