import { describe, expect, it, vi } from 'vitest'
import { MAX_FAVORITES, createFavoritesStore, type FavoritesStoreDeps } from './favorites-store'

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

// A fake favorites.json. `content` undefined means the file doesn't exist;
// `readError` makes reads fail the way a locked file does.
function fakeFile(initial?: string): FavoritesStoreDeps & {
  content: () => string | undefined
  readError: NodeJS.ErrnoException | null
  writeError: Error | null
  writes: number
} {
  let content = initial
  const file = {
    readError: null as NodeJS.ErrnoException | null,
    writeError: null as Error | null,
    writes: 0,
    content: () => content,
    readFile: async (): Promise<string> => {
      // A real read takes a turn of the event loop; without it the queue's
      // ordering would never be tested.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (file.readError) throw file.readError
      if (content === undefined) throw errno('ENOENT')
      return content
    },
    writeFile: async (data: string): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (file.writeError) throw file.writeError
      file.writes += 1
      content = data
    }
  }
  return file
}

const saved = (keys: string[]): string => JSON.stringify({ favorites: keys })

describe('favorites-store', () => {
  it('has no favorites when the file does not exist yet', async () => {
    expect(await createFavoritesStore(fakeFile()).list()).toEqual([])
  })

  it('saves a star and lists it back', async () => {
    const file = fakeFile()
    const store = createFavoritesStore(file)
    expect(await store.set('steam:440', true)).toEqual({ saved: true, keys: ['steam:440'] })
    expect(await store.list()).toEqual(['steam:440'])
    expect(JSON.parse(file.content() ?? '')).toEqual({ favorites: ['steam:440'] })
  })

  it('removes a star and keeps the others', async () => {
    const file = fakeFile(saved(['steam:440', 'epic:Sugar']))
    const result = await createFavoritesStore(file).set('steam:440', false)
    expect(result).toEqual({ saved: true, keys: ['epic:Sugar'] })
  })

  it("doesn't write when nothing changes", async () => {
    const file = fakeFile(saved(['steam:440']))
    const store = createFavoritesStore(file)
    expect(await store.set('steam:440', true)).toEqual({ saved: true, keys: ['steam:440'] })
    expect(await store.set('epic:Sugar', false)).toEqual({ saved: true, keys: ['steam:440'] })
    expect(file.writes).toBe(0)
  })

  it('keeps keys it does not understand (a future store, a game that is gone)', async () => {
    const file = fakeFile(saved(['gog:123', 'steam:1']))
    const result = await createFavoritesStore(file).set('steam:440', true)
    expect(result.keys).toEqual(['gog:123', 'steam:1', 'steam:440'])
  })

  it('never writes over a file it cannot read (locked by another program)', async () => {
    const file = fakeFile(saved(['steam:1', 'steam:2', 'steam:3']))
    file.readError = errno('EBUSY')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = createFavoritesStore(file)
    expect(await store.list()).toEqual([])
    expect(await store.set('steam:440', true)).toEqual({ saved: false, keys: [] })
    expect(file.writes).toBe(0)
    expect(JSON.parse(file.content() ?? '')).toEqual({
      favorites: ['steam:1', 'steam:2', 'steam:3']
    })

    // Once the file can be read again, the next star is saved on top of it.
    file.readError = null
    expect(await store.set('steam:440', true)).toEqual({
      saved: true,
      keys: ['steam:1', 'steam:2', 'steam:3', 'steam:440']
    })
    warn.mockRestore()
  })

  it('never writes over a file that is not valid JSON or has the wrong shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const content of ['{ "favorites": [', JSON.stringify({ favorites: 'steam:1' })]) {
      const file = fakeFile(content)
      expect(await createFavoritesStore(file).set('steam:440', true)).toEqual({
        saved: false,
        keys: []
      })
      expect(file.content()).toBe(content)
    }
    warn.mockRestore()
  })

  it('answers with the last list it read while the file is unreadable', async () => {
    const file = fakeFile(saved(['steam:440']))
    const store = createFavoritesStore(file)
    expect(await store.list()).toEqual(['steam:440'])
    file.readError = errno('EACCES')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await store.list()).toEqual(['steam:440'])
    expect(await store.set('steam:570', true)).toEqual({ saved: false, keys: ['steam:440'] })
    warn.mockRestore()
  })

  it('reports a failed write with what is really saved', async () => {
    const file = fakeFile(saved(['steam:440']))
    file.writeError = new Error('disk full')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await createFavoritesStore(file).set('steam:570', true)
    expect(result).toEqual({ saved: false, keys: ['steam:440'] })
    warn.mockRestore()
  })

  it('runs fast clicks one after another, so no save is lost', async () => {
    const file = fakeFile()
    const store = createFavoritesStore(file)
    const results = await Promise.all([
      store.set('steam:1', true),
      store.set('steam:2', true),
      store.set('steam:1', false),
      store.set('epic:Sugar', true)
    ])
    expect(results.map((r) => r.keys)).toEqual([
      ['steam:1'],
      ['steam:1', 'steam:2'],
      ['steam:2'],
      ['steam:2', 'epic:Sugar']
    ])
    expect(JSON.parse(file.content() ?? '')).toEqual({ favorites: ['steam:2', 'epic:Sugar'] })
  })

  it('carries on after a failed save', async () => {
    const file = fakeFile()
    // Only the first write fails.
    const writeFile = file.writeFile
    let failed = false
    file.writeFile = async (data) => {
      if (!failed) {
        failed = true
        throw new Error('disk full')
      }
      return writeFile(data)
    }
    const store = createFavoritesStore(file)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = store.set('steam:1', true)
    // Queued behind the failing save, and still saved.
    const second = store.set('steam:2', true)
    expect((await first).saved).toBe(false)
    expect(await second).toEqual({ saved: true, keys: ['steam:2'] })
    warn.mockRestore()
  })

  it('refuses a star past the limit, so the file always stays readable', async () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `steam:${i}`)
    const file = fakeFile(saved(full))
    const store = createFavoritesStore(file)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const refused = await store.set('steam:999999', true)
    expect(refused.saved).toBe(false)
    expect(refused.keys).toHaveLength(MAX_FAVORITES)
    expect(file.writes).toBe(0)
    // Removing one still works, and makes room again.
    expect((await store.set('steam:0', false)).saved).toBe(true)
    expect((await store.set('steam:999999', true)).saved).toBe(true)
    expect(await store.list()).toHaveLength(MAX_FAVORITES)
    warn.mockRestore()
  })

  it('drops duplicate keys from a hand-edited file', async () => {
    expect(await createFavoritesStore(fakeFile(saved(['steam:1', 'steam:1']))).list()).toEqual([
      'steam:1'
    ])
  })
})
