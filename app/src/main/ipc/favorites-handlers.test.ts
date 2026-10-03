import { describe, expect, it, vi } from 'vitest'
import type { FavoritesStore } from '../storage/favorites-store'
import { createFavoritesHandlers } from './favorites-handlers'

function fakeStore(): FavoritesStore & { set: ReturnType<typeof vi.fn> } {
  return {
    list: async () => ['steam:440'],
    set: vi.fn(async (key: string) => ({ saved: true, keys: [key] }))
  }
}

describe('favorites handlers', () => {
  it('saves a valid Steam or Epic request under main-built key', async () => {
    const store = fakeStore()
    const handlers = createFavoritesHandlers(store)
    await handlers.set({ store: 'steam', id: '440', favorite: true })
    await handlers.set({ store: 'epic', id: 'Sugar', favorite: false })
    expect(store.set.mock.calls).toEqual([
      ['steam:440', true],
      ['epic:Sugar', false]
    ])
  })

  it('lists what the store has', async () => {
    expect(await createFavoritesHandlers(fakeStore()).list()).toEqual(['steam:440'])
  })

  it.each([
    ['an unknown store', { store: 'gog', id: '1', favorite: true }],
    ['a prototype key as store', { store: 'toString', id: '1', favorite: true }],
    ['a Steam id that is not digits', { store: 'steam', id: '440:x', favorite: true }],
    ['a Steam id that is too long', { store: 'steam', id: '1'.repeat(21), favorite: true }],
    ['an Epic id with a colon', { store: 'epic', id: 'a:b', favorite: true }],
    ['an Epic id that is too long', { store: 'epic', id: 'a'.repeat(101), favorite: true }],
    ['an empty id', { store: 'steam', id: '', favorite: true }],
    ['a missing flag', { store: 'steam', id: '440' }],
    ['a string flag', { store: 'steam', id: '440', favorite: 'yes' }],
    ['not an object', 'steam:440']
  ])('rejects %s without saving', async (_name, request) => {
    const store = fakeStore()
    await expect(createFavoritesHandlers(store).set(request)).rejects.toThrow()
    expect(store.set).not.toHaveBeenCalled()
  })
})
