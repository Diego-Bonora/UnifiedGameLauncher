import { ipcMain } from 'electron'
import { FAVORITES_CHANNELS } from '@shared/ipc/favorites'
import type { FavoritesStore } from '../storage/favorites-store'
import { createFavoritesHandlers } from './favorites-handlers'

// Takes the store rather than making one: there must be a single store (one
// save queue) for favorites.json, shared with anything else that changes it
// (removing a manual game drops its star).
export function registerFavoritesIpc(store: FavoritesStore): void {
  const handlers = createFavoritesHandlers(store)
  ipcMain.handle(FAVORITES_CHANNELS.list, () => handlers.list())
  ipcMain.handle(FAVORITES_CHANNELS.set, (_event, rawRequest: unknown) => handlers.set(rawRequest))
}
