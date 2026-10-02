import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

// The store-agnostic half of the cover cache: where each store's covers live,
// how a downloaded file is checked and saved, and how an app-cover:// URL maps
// back to a file. Steam's sync (cover-cache.ts) and Epic's (epic-cover-cache.ts)
// differ in when they download and prune, but must share these safety rules.

// Custom scheme the renderer loads cached covers through (see
// cover-protocol.ts).
export const COVER_SCHEME = 'app-cover'

export type CoverStore = 'steam' | 'epic'

// Separate folders, because Steam's sync deletes every file in its folder
// that isn't a current Steam cover; sharing one would wipe Epic's covers.
// The URL host and id rule are per store too: Steam ids are digits, Epic's
// are the manifest AppName (same charset the manifest parser accepts).
const STORES: Record<CoverStore, { folder: string; host: string; idPattern: RegExp }> = {
  steam: { folder: 'covers', host: 'covers', idPattern: /^\d+$/ },
  epic: { folder: 'covers-epic', host: 'epic', idPattern: /^[A-Za-z0-9_-]{1,100}$/ }
}

// The only file extensions a cached cover can have. Which one a downloaded
// image gets is decided by its own first bytes (detectImageExtension), never
// by the URL or the Content-Type header, so a hostile or broken response
// can't choose its own file name or type.
export const COVER_EXTENSIONS = ['jpg', 'png', 'webp'] as const
export type CoverExtension = (typeof COVER_EXTENSIONS)[number]

// Real covers are well under 1 MB; this stops a bad response from filling the
// disk or memory. Enforced while streaming, not after buffering.
export const MAX_COVER_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

// Windows treats these as devices in any folder and with any extension, so
// "NUL.png" can't be a cover file. No real Epic AppName is one, but the id
// becomes a file name, so it's refused rather than trusted.
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i

export function isValidCoverId(store: CoverStore, id: string): boolean {
  return STORES[store].idPattern.test(id) && !WINDOWS_DEVICE_NAMES.test(id)
}

export function coverDirPath(store: CoverStore): string {
  return join(app.getPath('userData'), STORES[store].folder)
}

export async function listCoverFilesIn(store: CoverStore): Promise<string[]> {
  try {
    return await readdir(coverDirPath(store))
  } catch {
    // Folder not created yet (first run) means "no covers cached".
    return []
  }
}

// Temp file then rename, so the protocol handler never serves a half-written
// image.
export async function writeCoverFile(
  store: CoverStore,
  fileName: string,
  bytes: Uint8Array
): Promise<void> {
  const dir = coverDirPath(store)
  await mkdir(dir, { recursive: true })
  const tempPath = join(dir, `${fileName}.tmp`)
  await writeFile(tempPath, bytes)
  await rename(tempPath, join(dir, fileName))
}

// Only ever called with names that came from a folder listing, never from a
// request or a response.
export function deleteCoverFile(store: CoverStore, fileName: string): Promise<void> {
  return rm(join(coverDirPath(store), fileName), { force: true })
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

// The caller must already have checked `url` against its store's allow-list.
export async function fetchCoverBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  // `redirect: 'error'`: the URL was checked against an allow-list, so a
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
}

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  return bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Identifies the image by its magic bytes. An empty body, an HTML error page
// that came back as "200 OK", or any other non-image returns null and is never
// written, so a bad download can't leave a file that hides the remote URL.
export function detectImageExtension(bytes: Uint8Array): CoverExtension | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png'
  // WebP is a RIFF container: "RIFF" <size> "WEBP".
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp'
  return null
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0))

// Animated PNG and WebP share their still siblings' signatures, so a "static
// only" rule can't rest on detectImageExtension or on the server's filter.
// APNG: an "acTL" chunk appears before the first "IDAT". Animated WebP: the
// extended "VP8X" header has its animation flag (0x02) set.
export function isAnimatedImage(bytes: Uint8Array): boolean {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    let offset = PNG_SIGNATURE.length
    while (offset + 8 <= bytes.length) {
      const length =
        ((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0)
      if (startsWith(bytes, ascii('acTL'), offset + 4)) return true
      if (startsWith(bytes, ascii('IDAT'), offset + 4)) return false
      // length, type, data, CRC. `>>> 0` keeps a huge length positive so a
      // corrupt chunk ends the walk instead of looping backwards.
      offset += 12 + (length >>> 0)
    }
    return false
  }
  if (startsWith(bytes, ascii('VP8X'), 12)) return ((bytes[20] ?? 0) & 0x02) !== 0
  return false
}

// Exact-name match against the known extensions, so leftovers like
// "123.jpg.tmp" are never treated as a cached cover.
export function findCoverFileName(id: string, files: ReadonlySet<string>): string | null {
  for (const extension of COVER_EXTENSIONS) {
    const name = `${id}.${extension}`
    if (files.has(name)) return name
  }
  return null
}

// The id a cover file belongs to, or null for anything that isn't exactly
// "<valid id>.<known extension>" (temp files, strays).
export function coverIdFromFileName(store: CoverStore, fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return null
  const id = fileName.slice(0, dot)
  const extension = fileName.slice(dot + 1)
  if (!(COVER_EXTENSIONS as readonly string[]).includes(extension)) return null
  return isValidCoverId(store, id) ? id : null
}

export function coverUrlFor(store: CoverStore, id: string): string {
  return `${COVER_SCHEME}://${STORES[store].host}/${id}`
}

// Turns a request URL into the store and id it asks for, or null for anything
// that isn't exactly "app-cover://<store host>/<valid id>". The caller rebuilds
// the file name from the id and the fixed extension list, never from the
// request, so there is no path to traverse.
export function parseCoverRequest(requestUrl: string): { store: CoverStore; id: string } | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${COVER_SCHEME}:`) return null
  const store = (Object.keys(STORES) as CoverStore[]).find(
    (key) => STORES[key].host === url.hostname
  )
  if (store === undefined) return null
  const match = /^\/([^/]+)$/.exec(url.pathname)
  if (match === null || match[1] === undefined) return null
  return isValidCoverId(store, match[1]) ? { store, id: match[1] } : null
}
