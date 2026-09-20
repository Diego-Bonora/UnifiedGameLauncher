import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { SteamOwnedGame } from '@shared/ipc/steam-channels'
import { isSteamCoverAssetUrl, runWithConcurrencyLimit } from '../stores/steam/library-cover-art'

// Custom scheme the renderer loads cached covers through (see
// cover-protocol.ts). Lives here, not there, so the URL builder and the
// request parser below sit next to each other.
export const COVER_SCHEME = 'app-cover'
const COVER_HOST = 'covers'

// Only these types are cached, and each maps to a fixed extension — the
// extension comes from this table, never from the URL or the response, so a
// hostile response can't choose its own file name.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}
const COVER_EXTENSIONS = Object.values(EXTENSION_BY_CONTENT_TYPE)

// Real covers are well under 1 MB; this only stops a bad response from
// filling the disk.
const MAX_COVER_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

// Same reasoning as library-cover-art.ts: cap concurrency against Steam's
// edge rather than firing one request per game at once.
const MAX_CONCURRENT_DOWNLOADS = 4

export interface CoverCacheDeps {
  // File names (not paths) currently in the covers folder.
  listFiles: () => Promise<string[]>
  fetchImage: (url: string) => Promise<{ bytes: Uint8Array; contentType: string | null }>
  writeFile: (fileName: string, bytes: Uint8Array) => Promise<void>
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

const realDeps: CoverCacheDeps = {
  listFiles: listCoverFiles,
  fetchImage: async (url) => {
    // `redirect: 'error'`: the URL was checked against the allow-list, so a
    // redirect to some other host must fail instead of being followed.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error'
    })
    if (!response.ok) throw new Error(`cover download responded with ${response.status}`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > MAX_COVER_BYTES) throw new Error('cover is larger than the size limit')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_COVER_BYTES) throw new Error('cover is larger than the size limit')
    return { bytes, contentType: response.headers.get('content-type') }
  },
  writeFile: async (fileName, bytes) => {
    const dir = coversDirPath()
    await mkdir(dir, { recursive: true })
    // Temp file then rename, so the protocol handler never serves a
    // half-written image.
    const tempPath = join(dir, `${fileName}.tmp`)
    await writeFile(tempPath, bytes)
    await rename(tempPath, join(dir, fileName))
  }
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

function normalizeContentType(contentType: string | null): string | null {
  return contentType === null ? null : (contentType.split(';')[0] ?? '').trim().toLowerCase()
}

// Two overlapping calls (a refresh landing while the previous one is still
// downloading) would race on the same temp files. Joining the running one
// is enough: it already covers every game the second call would.
let inFlight: Promise<void> | null = null

// Downloads covers that aren't on disk yet. Never throws: a cover that
// can't be fetched just stays remote/placeholder, like the rest of this
// app's "missing art degrades quietly" convention.
export function downloadMissingCovers(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<void> {
  if (inFlight !== null) return inFlight
  const run = (async () => {
    let existing: Set<string>
    try {
      existing = new Set(await deps.listFiles())
    } catch (err) {
      console.warn('[steam] could not read the covers folder:', err)
      return
    }
    const tasks = games.flatMap((game) => {
      const url = game.coverUrl
      // The allow-list check happens HERE as well as on cache read: this is
      // the last gate before a network request goes out.
      if (url === null || !isSteamCoverAssetUrl(url)) return []
      if (findCoverFileName(game.appId, existing) !== null) return []
      return [
        async (): Promise<void> => {
          try {
            const { bytes, contentType } = await deps.fetchImage(url)
            const extension = EXTENSION_BY_CONTENT_TYPE[normalizeContentType(contentType) ?? '']
            if (extension === undefined) return
            await deps.writeFile(`${game.appId}.${extension}`, bytes)
          } catch (err) {
            console.warn(`[steam] could not cache the cover for app ${game.appId}:`, err)
          }
        }
      ]
    })
    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_DOWNLOADS)
  })().finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
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
// file name is rebuilt from the digits and the fixed extension table, never
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
