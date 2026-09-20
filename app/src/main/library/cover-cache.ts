import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { SteamOwnedGame } from '@shared/ipc/steam-channels'
import { isSteamCoverAssetUrl, runWithConcurrencyLimit } from '../stores/steam/library-cover-art'

// Custom scheme the renderer loads cached covers through (see
// cover-protocol.ts). Lives here, not there, so the URL builder and the
// request parser below sit next to each other.
export const COVER_SCHEME = 'app-cover'
const COVER_HOST = 'covers'

// The only file extensions a cached cover can have. Which one a downloaded
// image gets is decided by its own first bytes (detectImageExtension), never
// by the URL or the Content-Type header, so a hostile or broken response
// can't choose its own file name or type.
const COVER_EXTENSIONS = ['jpg', 'png', 'webp'] as const
type CoverExtension = (typeof COVER_EXTENSIONS)[number]

// Real covers are well under 1 MB; this stops a bad response from filling the
// disk or memory. Enforced while streaming, not after buffering.
const MAX_COVER_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

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

export function coversDirPath(): string {
  return join(app.getPath('userData'), 'covers')
}

export async function listCoverFiles(): Promise<string[]> {
  try {
    return await readdir(coversDirPath())
  } catch {
    // Folder not created yet (first run) means "no covers cached".
    return []
  }
}

// Reads a response body but gives up as soon as it passes `limit` bytes.
// `arrayBuffer()` would buffer everything first, and a chunked or compressed
// response can carry more than its Content-Length suggests.
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limit: number
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw new Error('cover is larger than the size limit')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

// Identifies the image by its magic bytes. An empty body, an HTML error page
// that came back as "200 OK", or any other non-image returns null and is never
// written, so a bad download can't leave a file that hides the remote URL.
export function detectImageExtension(bytes: Uint8Array): CoverExtension | null {
  const startsWith = (signature: number[], at = 0): boolean =>
    bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b)

  if (startsWith([0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // WebP is a RIFF container: "RIFF" <size> "WEBP".
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  return null
}

const realDeps: CoverCacheDeps = {
  listFiles: listCoverFiles,
  fetchImage: async (url, signal) => {
    // `redirect: 'error'`: the URL was checked against the allow-list, so a
    // redirect to some other host must fail instead of being followed.
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      redirect: 'error'
    })
    if (!response.ok) throw new Error(`cover download responded with ${response.status}`)
    // A cheap early exit only; the streaming limit below is the real check.
    if (Number(response.headers.get('content-length')) > MAX_COVER_BYTES) {
      throw new Error('cover is larger than the size limit')
    }
    return readBodyWithLimit(response.body, MAX_COVER_BYTES)
  },
  writeFile: async (fileName, bytes) => {
    const dir = coversDirPath()
    await mkdir(dir, { recursive: true })
    // Temp file then rename, so the protocol handler never serves a
    // half-written image.
    const tempPath = join(dir, `${fileName}.tmp`)
    await writeFile(tempPath, bytes)
    await rename(tempPath, join(dir, fileName))
  },
  // Only ever called with names that came from listFiles(), never from a
  // request or a response.
  deleteFile: (fileName) => rm(join(coversDirPath(), fileName), { force: true })
}

// Exact-name match against the known extensions, so leftovers like
// "123.jpg.tmp" are never treated as a cached cover.
export function findCoverFileName(appId: string, files: ReadonlySet<string>): string | null {
  for (const extension of COVER_EXTENSIONS) {
    const name = `${appId}.${extension}`
    if (files.has(name)) return name
  }
  return null
}

// --- Syncing -------------------------------------------------------------
//
// Runs are chained one after another instead of skipped when one is already
// going: a second call may carry games the first never saw (a new purchase),
// and each run re-reads the folder, so a queued run just skips what the
// previous one already saved.
let queueTail: Promise<void> = Promise.resolve()

// clearCovers bumps this so runs that were queued BEFORE a disconnect don't
// download the old account's covers afterwards.
let clearGeneration = 0
let activeAbort: AbortController | null = null

async function runSync(
  games: SteamOwnedGame[],
  generation: number,
  deps: CoverCacheDeps
): Promise<void> {
  if (generation !== clearGeneration) return
  const controller = new AbortController()
  activeAbort = controller
  try {
    let files: string[]
    try {
      files = await deps.listFiles()
    } catch (err) {
      console.warn('[steam] could not read the covers folder:', err)
      return
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
          } catch (err) {
            if (controller.signal.aborted) return
            console.warn(`[steam] could not cache the cover for app ${game.appId}:`, err)
          }
        }
      ]
    })
    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_DOWNLOADS)
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

// Keeps the covers folder in step with the library: removes covers that no
// longer belong, then downloads the missing ones. Never rejects: a cover that
// can't be fetched just stays remote/placeholder, like the rest of this app's
// "missing art degrades quietly" convention.
export function syncCovers(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<void> {
  const generation = clearGeneration
  const run = queueTail.then(() => runSync(games, generation, deps))
  queueTail = run.catch(() => undefined)
  return run.catch((err: unknown) => {
    console.warn('[steam] cover sync failed:', err)
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
      ? { ...game, coverUrl: `${COVER_SCHEME}://${COVER_HOST}/${game.appId}` }
      : game
  )
}

// Turns a request URL into the file to serve, or null for anything that
// isn't exactly "app-cover://covers/<digits>" naming a cached cover. The
// file name is rebuilt from the digits and the fixed extension list, never
// taken from the request, so there is no path to traverse.
export function coverFileNameForRequest(
  requestUrl: string,
  files: ReadonlySet<string>
): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${COVER_SCHEME}:` || url.hostname !== COVER_HOST) return null
  const match = /^\/(\d+)$/.exec(url.pathname)
  if (match === null || match[1] === undefined) return null
  return findCoverFileName(match[1], files)
}
