import type { StoreId } from '../stores'

// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). The zod checks live in favorites.ts, which
// only main imports.
export const FAVORITES_CHANNELS = {
  list: 'favorites:list',
  set: 'favorites:set'
} as const

export interface FavoriteRequest {
  store: StoreId
  // The store's own id (Steam appId, Epic AppName). Main builds the key from
  // it, so the renderer can't save a key in some other shape.
  id: string
  favorite: boolean
}

// `keys` is what main has saved after this request, saved or not: the
// renderer shows exactly that, so a failed save goes back to the real state
// rather than to a guess. A file main can't read keeps the last list it read.
export interface FavoriteSetResult {
  saved: boolean
  keys: string[]
}
