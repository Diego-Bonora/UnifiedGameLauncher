import { parseFavoriteRequest, type FavoriteSetResult } from '@shared/ipc/favorites'
import { gameKey } from '@shared/stores'
import type { FavoritesStore } from '../storage/favorites-store'

// The logic behind the favorites channels, free of Electron imports so it can
// be tested directly; ipc/favorites.ts only wires it to ipcMain.
export function createFavoritesHandlers(store: FavoritesStore): {
  list: () => Promise<string[]>
  set: (rawRequest: unknown) => Promise<FavoriteSetResult>
} {
  return {
    list: () => store.list(),
    set: async (rawRequest) => {
      const request = parseFavoriteRequest(rawRequest)
      // Only a caller bug gets here (the preload builds the payload), so it
      // throws rather than returning a message for the user.
      if (request === null) throw new Error('Invalid favorite request')
      // Main builds the key, so only `<known store>:<valid id>` is ever saved.
      return store.set(gameKey(request.store, request.id), request.favorite)
    }
  }
}
