import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { FavoriteSetResult } from '@shared/ipc/favorites'

// The starred games (docs/features/library-tools.md, "Favorites"), as a list
// of `<store>:<id>` keys in favorites.json.

export interface FavoritesStoreDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function favoritesFilePath(): string {
  return join(app.getPath('userData'), 'favorites.json')
}

const realDeps: FavoritesStoreDeps = {
  readFile: () => readFile(favoritesFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a half-written
    // favorites.json behind.
    const path = favoritesFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

// Keys are checked only for being sane strings, not against today's stores:
// a key from a store this version doesn't know (or a game that's gone) is
// carried over untouched rather than dropped by the next save.
// One limit for reading and writing: a save the reader would reject would
// lock the user out of every favorite from then on. Far more than anyone
// stars; it stops a runaway caller from growing the file without end.
export const MAX_FAVORITES = 10_000

const fileSchema = z.object({
  favorites: z.array(z.string().min(1).max(200)).max(MAX_FAVORITES)
})

type ReadResult = { readable: true; keys: string[] } | { readable: false }

async function readFavoritesFile(deps: FavoritesStoreDeps): Promise<ReadResult> {
  let text: string
  try {
    text = await deps.readFile()
  } catch (err) {
    // No file yet is the normal first run, not a problem.
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT')
      return { readable: true, keys: [] }
    console.warn('[favorites] could not read favorites.json:', err)
    return { readable: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    console.warn('[favorites] favorites.json is not valid JSON:', err)
    return { readable: false }
  }
  const result = fileSchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[favorites] favorites.json has an unexpected shape')
    return { readable: false }
  }
  return { readable: true, keys: [...new Set(result.data.favorites)] }
}

export interface FavoritesStore {
  // Never rejects. An unreadable file gives the last list read (empty at
  // first): the stars just don't show, and nothing is written over it.
  list: () => Promise<string[]>
  // Never rejects: a failure is `saved: false` with what is really saved.
  set: (key: string, favorite: boolean) => Promise<FavoriteSetResult>
}

export function createFavoritesStore(deps: FavoritesStoreDeps = realDeps): FavoritesStore {
  // The last list read from or written to the file, for answering while the
  // file can't be read.
  let lastKnown: string[] = []

  // One read-modify-write at a time (same reason as connection-store.ts):
  // two fast clicks would otherwise both read the same old list, and the
  // second save would undo the first, or collide on the temp file. Reads go
  // through it too, so a list never sees a save half done.
  let queue: Promise<unknown> = Promise.resolve()
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task)
    queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  return {
    list: () =>
      enqueue(async () => {
        const read = await readFavoritesFile(deps)
        if (read.readable) lastKnown = read.keys
        return lastKnown
      }),

    set: (key, favorite) =>
      enqueue(async () => {
        const read = await readFavoritesFile(deps)
        // Never write over a file that couldn't be read: it may hold every
        // star the user has, and this save would replace them with one.
        if (!read.readable) return { saved: false, keys: lastKnown }
        lastKnown = read.keys
        const has = read.keys.includes(key)
        if (has === favorite) return { saved: true, keys: read.keys }
        if (favorite && read.keys.length >= MAX_FAVORITES) {
          console.warn('[favorites] not saved: already at the favorites limit')
          return { saved: false, keys: read.keys }
        }
        const next = favorite ? [...read.keys, key] : read.keys.filter((k) => k !== key)
        try {
          await deps.writeFile(JSON.stringify({ favorites: next }, null, 2))
        } catch (err) {
          console.warn('[favorites] could not save favorites.json:', err)
          return { saved: false, keys: read.keys }
        }
        lastKnown = next
        return { saved: true, keys: next }
      })
  }
}
