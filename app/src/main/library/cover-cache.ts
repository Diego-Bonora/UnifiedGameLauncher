import { COVER_URL_PREFIX, type SteamOwnedGame } from '@shared/ipc/steam-channels'
import { isSteamCoverAssetUrl, runWithConcurrencyLimit } from '../stores/steam/library-cover-art'
import {
  COVER_EXTENSIONS,
  deleteCoverFile,
  detectImageExtension,
  fetchCoverBytes,
  findCoverFileName,
  listCoverFilesIn,
  writeCoverFile
} from './cover-files'

// Steam's cover sync. The file checks, folder and URL rules it relies on are
// shared with Epic and live in cover-files.ts.

// Same reasoning as library-cover-art.ts: cap concurrency against Steam's
// edge rather than firing one request per game at once.
const MAX_CONCURRENT_DOWNLOADS = 4

export interface CoverCacheDeps {
  // File names (not paths) currently in the covers folder.
  listFiles: () => Promise<string[]>
  // Resolves to the raw bytes; the caller checks they are really an image.
  fetchImage: (url: string, signal: AbortSignal) => Promise<Uint8Array>
  writeFile: (fileName: string, bytes: Uint8Array) => Promise<void>
  deleteFile: (fileName: string) => Promise<void>
}

const realDeps: CoverCacheDeps = {
  listFiles: () => listCoverFilesIn('steam'),
  fetchImage: fetchCoverBytes,
  writeFile: (fileName, bytes) => writeCoverFile('steam', fileName, bytes),
  deleteFile: (fileName) => deleteCoverFile('steam', fileName)
}

// --- Syncing -------------------------------------------------------------
//
// Runs are chained one after another instead of skipped when one is already
// going: a second call may carry games the first never saw (a new purchase),
// and each run re-reads the folder, so a queued run just skips what the
// previous one already saved.
let queueTail: Promise<unknown> = Promise.resolve()

// clearCovers bumps this so runs that were queued BEFORE a disconnect don't
// download the old account's covers afterwards.
let clearGeneration = 0
let activeAbort: AbortController | null = null

// Resolves to how many covers were newly saved, so the caller can tell the
// window when there is something new to show.
async function runSync(
  games: SteamOwnedGame[],
  generation: number,
  deps: CoverCacheDeps
): Promise<number> {
  if (generation !== clearGeneration) return 0
  let downloaded = 0
  const controller = new AbortController()
  activeAbort = controller
  try {
    let files: string[]
    try {
      files = await deps.listFiles()
    } catch (err) {
      console.warn('[steam] could not read the covers folder:', err)
      return 0
    }

    // Prune first, but never against an empty library: an empty live result
    // is more likely a private profile or a bad response than "the user
    // owns nothing", and covers are worth keeping until that is clear.
    // Everything not belonging to a current game goes: covers of removed
    // games, and leftover ".tmp" files from an interrupted download.
    const existing = new Set(files)
    if (games.length > 0) {
      const keep = new Set(
        games.flatMap((game) => COVER_EXTENSIONS.map((ext) => `${game.appId}.${ext}`))
      )
      for (const name of files) {
        if (keep.has(name)) continue
        try {
          await deps.deleteFile(name)
          existing.delete(name)
        } catch (err) {
          console.warn('[steam] could not remove a stale cover file:', err)
        }
      }
    }

    const tasks = games.flatMap((game) => {
      const url = game.coverUrl
      // The allow-list check happens HERE as well as on cache read: this is
      // the last gate before a network request goes out.
      if (url === null || !isSteamCoverAssetUrl(url)) return []
      if (findCoverFileName(game.appId, existing) !== null) return []
      return [
        async (): Promise<void> => {
          if (controller.signal.aborted) return
          try {
            const bytes = await deps.fetchImage(url, controller.signal)
            const extension = detectImageExtension(bytes)
            if (extension === null) return
            // A disconnect may have landed while this was downloading.
            if (controller.signal.aborted) return
            await deps.writeFile(`${game.appId}.${extension}`, bytes)
            downloaded++
          } catch (err) {
            if (controller.signal.aborted) return
            console.warn(`[steam] could not cache the cover for app ${game.appId}:`, err)
          }
        }
      ]
    })
    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_DOWNLOADS)
    return downloaded
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

// Keeps the covers folder in step with the library: removes covers that no
// longer belong, then downloads the missing ones. Resolves to the number of
// covers newly saved. Never rejects: a cover that can't be fetched just stays
// remote/placeholder, like the rest of this app's "missing art degrades
// quietly" convention.
export function syncCovers(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<number> {
  const generation = clearGeneration
  const run = queueTail.then(() => runSync(games, generation, deps))
  queueTail = run.catch(() => undefined)
  return run.catch((err: unknown) => {
    console.warn('[steam] cover sync failed:', err)
    return 0
  })
}

// For disconnect: stops any running or queued downloads, waits for them to
// wind down (they abort immediately, so this is quick), then deletes every
// cached cover. Throws if a file could not be removed, so the caller doesn't
// tell the user their data is gone when it isn't.
export async function clearCovers(deps: CoverCacheDeps = realDeps): Promise<void> {
  clearGeneration++
  activeAbort?.abort()
  await queueTail

  const files = await deps.listFiles()
  const results = await Promise.allSettled(files.map((name) => deps.deleteFile(name)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`[steam] could not remove ${failed.length} cached cover file(s)`)
    throw new Error('Could not remove all saved cover images.')
  }
}

// Swaps in the local URL for every game whose cover is on disk; the rest keep
// their remote URL (or null). One folder listing for the whole list rather
// than a file check per game.
export async function withLocalCoverUrls(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<SteamOwnedGame[]> {
  const files = new Set(await deps.listFiles())
  return games.map((game) =>
    findCoverFileName(game.appId, files) !== null
      ? { ...game, coverUrl: `${COVER_URL_PREFIX}${game.appId}` }
      : game
  )
}
