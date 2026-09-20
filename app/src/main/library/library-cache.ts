import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { SteamOwnedGame } from '@shared/ipc/steam-channels'

// Same injectable-deps shape as connection-store.ts, and for the same reason:
// the real path needs app.getPath, which throws under Vitest, so it is only
// resolved inside realDeps when that code actually runs.
export interface LibraryCacheDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function cacheFilePath(): string {
  return join(app.getPath('userData'), 'library-cache.json')
}

const realDeps: LibraryCacheDeps = {
  readFile: () => readFile(cacheFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a half-written
    // cache behind (which would just be discarded as corrupt, losing the
    // whole saved library).
    const path = cacheFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

const steamOwnedGameSchema = z.object({
  appId: z.string().regex(/^\d+$/),
  title: z.string().min(1),
  coverUrl: z.string().nullable()
}) satisfies z.ZodType<SteamOwnedGame>

// Bump when SteamOwnedGame changes shape. An entry with any other version
// fails validation and reads as "no cache", so the next live fetch simply
// rewrites it — no migration needed for data that is cheap to re-fetch.
const CACHE_VERSION = 1

// Tagged with the account it was fetched for: a cache written for one Steam
// account must never be shown after signing in as another.
const steamCacheEntrySchema = z.object({
  version: z.literal(CACHE_VERSION),
  steamId64: z.string().regex(/^\d{17}$/),
  fetchedAt: z.number(),
  games: z.array(steamOwnedGameSchema)
})

type SteamCacheEntry = z.infer<typeof steamCacheEntrySchema>

// A plain record keyed by store, like connections.json, so Epic can add its
// own key in Milestone 4 without this file needing to understand its shape.
async function readRawCacheFile(deps: LibraryCacheDeps): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await deps.readFile())
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    // Missing file (first run) or corrupt JSON both mean "nothing cached".
    return {}
  }
}

// Returns null (never throws) for: no cache, a corrupt or old-version cache,
// or a cache that belongs to a different account. The caller treats all of
// them as "no saved library yet".
export async function getCachedSteamLibrary(
  steamId64: string,
  deps: LibraryCacheDeps = realDeps
): Promise<SteamOwnedGame[] | null> {
  const raw = await readRawCacheFile(deps)
  const result = steamCacheEntrySchema.safeParse(raw['steam'])
  if (!result.success || result.data.steamId64 !== steamId64) return null
  return result.data.games
}

// Every read-modify-write goes through one queue — see connection-store.ts
// for the two races this closes (a stale-snapshot read losing another key,
// and two writers colliding on the same temp file).
let writeQueue: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task)
  // A failed task must not wedge later ones, but its error still reaches
  // whoever awaited `result`.
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export async function setCachedSteamLibrary(
  steamId64: string,
  games: SteamOwnedGame[],
  deps: LibraryCacheDeps = realDeps,
  now: () => number = Date.now
): Promise<void> {
  await enqueueWrite(async () => {
    const raw = await readRawCacheFile(deps)
    const entry: SteamCacheEntry = { version: CACHE_VERSION, steamId64, fetchedAt: now(), games }
    raw['steam'] = entry
    try {
      await deps.writeFile(JSON.stringify(raw))
    } catch (err) {
      console.warn('[steam] could not save the library cache:', err)
      throw err
    }
  })
}

// Removes only Steam's entry, leaving any other store's cache alone. Used on
// disconnect so a full game list doesn't stay on disk for an account the user
// has signed out of (matches the privacy policy's "disconnect deletes saved
// data").
export async function clearCachedSteamLibrary(deps: LibraryCacheDeps = realDeps): Promise<void> {
  await enqueueWrite(async () => {
    const raw = await readRawCacheFile(deps)
    if (!('steam' in raw)) return
    delete raw['steam']
    try {
      await deps.writeFile(JSON.stringify(raw))
    } catch (err) {
      console.warn('[steam] could not clear the library cache:', err)
      throw err
    }
  })
}
