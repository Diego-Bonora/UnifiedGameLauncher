import { z } from 'zod'
import type { StoreId } from '../stores'
import { epicLaunchRequestSchema } from './epic'
import type { FavoriteRequest } from './favorites-channels'
import { steamAppRequestSchema } from './steam'
import { manualIdSchema } from './manual'

export { FAVORITES_CHANNELS } from './favorites-channels'
export type { FavoriteRequest, FavoriteSetResult } from './favorites-channels'

// Each store's id rules, taken from the schemas its own launch channel uses,
// so a favorite can only name a game the app could show. A Record over every
// StoreId: a new store doesn't compile until its id rule is added here.
const ID_SCHEMAS: Record<StoreId, z.ZodType<string>> = {
  steam: steamAppRequestSchema.shape.appId.max(20),
  epic: epicLaunchRequestSchema.shape.appName,
  manual: manualIdSchema
}

function isStoreId(value: string): value is StoreId {
  return Object.hasOwn(ID_SCHEMAS, value)
}

const requestShape = z.object({
  store: z.string(),
  id: z.string(),
  favorite: z.boolean()
})

// Only main imports this file (it needs zod). null for anything that isn't a
// known store with an id of that store's shape.
export function parseFavoriteRequest(raw: unknown): FavoriteRequest | null {
  const shape = requestShape.safeParse(raw)
  if (!shape.success || !isStoreId(shape.data.store)) return null
  const id = ID_SCHEMAS[shape.data.store].safeParse(shape.data.id)
  if (!id.success) return null
  return { store: shape.data.store, id: id.data, favorite: shape.data.favorite }
}
