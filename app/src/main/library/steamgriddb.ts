import { z } from 'zod'
import { isValidCoverId, readBodyWithLimit } from './cover-files'

// SteamGridDB API v2, used only to find a poster for an installed Epic game.
// Response shapes and the id form were captured with real requests on
// 2026-10-02 (docs/features/epic-covers.md): `egs` takes the manifest's
// AppName; catalog ids 404.

const API_BASE = 'https://www.steamgriddb.com/api/v2'
const FETCH_TIMEOUT_MS = 15_000

// A real 50-grid answer is about 40 KB; anything far bigger is not one.
const MAX_RESPONSE_BYTES = 1024 * 1024

// A Retry-After beyond this is treated as this, so one odd header can't stop
// lookups for the rest of the session.
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000

// Every image URL seen, full-size and thumbnail, was on this host.
const IMAGE_HOST = 'cdn2.steamgriddb.com'

// 2:3 posters only; without this filter SteamGridDB also returns 920x430
// banners and 1024x1024 squares (seen in the capture).
const POSTER_DIMENSIONS = ['600x900', '342x482', '660x930']
const STILL_MIMES = ['image/png', 'image/jpeg']

// One request per game, not the multi-id form: a multi-id answer lists
// results by position without naming the game, and its all-miss shape is
// unverified. Lookups are rare (startup, install changes) and misses are
// remembered, so the extra requests are cheap.
const GRID_QUERY = new URLSearchParams({
  dimensions: POSTER_DIMENSIONS.join(','),
  mimes: STILL_MIMES.join(','),
  types: 'static',
  nsfw: 'false',
  humor: 'false',
  epilepsy: 'false'
}).toString()

export type GridLookup =
  | { kind: 'found'; url: string }
  // SteamGridDB said it has no such game, or has no poster for it.
  | { kind: 'none' }
  // Posters came back for this game but none passed our checks. A problem
  // with this one game's answer, not with the service: skip the game without
  // a "no cover" mark, and keep looking up the others.
  | { kind: 'unusable' }
  | { kind: 'keyRejected' }
  // Offline, timeout, rate limit, server trouble or an answer in a shape we
  // don't recognise. Never recorded as "no cover".
  | { kind: 'unavailable'; retryAfterMs: number | null }

export interface SteamGridDbResponse {
  status: number
  retryAfter: string | null
  // Parsed JSON, or null if the body wasn't JSON.
  body: unknown
}

export interface SteamGridDbDeps {
  request: (path: string, apiKey: string, signal: AbortSignal) => Promise<SteamGridDbResponse>
}

const realDeps: SteamGridDbDeps = {
  request: async (path, apiKey, signal) => {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // The API never redirected in testing; following one would send the
      // key header somewhere unchecked.
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
    })
    // Throws past the limit; lookupEpicGrid reports that as unavailable.
    const bytes = await readBodyWithLimit(response.body, MAX_RESPONSE_BYTES)
    let body: unknown = null
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      // Not JSON (an outage or block page); interpretGridResponse decides.
    }
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body }
  }
}

export function isSteamGridDbImageUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.host === IMAGE_HOST &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.search === '' &&
    /^\/grid\/[A-Za-z0-9]+\.(png|jpe?g)$/.test(parsed.pathname)
  )
}

const gridSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
  mime: z.string(),
  nsfw: z.boolean(),
  humor: z.boolean(),
  epilepsy: z.boolean()
})

const gridListSchema = z.object({ success: z.literal(true), data: z.array(z.unknown()) })
// SteamGridDB's own error shape, e.g. {"success":false,"errors":["Invalid API key"]}.
const errorSchema = z.object({ success: z.literal(false), errors: z.array(z.string()) })

// The query already asks for all of this; checking again means a server
// that ignores a filter can't hand us a banner, an animation or a tagged
// image.
function isAcceptableGrid(grid: z.infer<typeof gridSchema>): boolean {
  return (
    POSTER_DIMENSIONS.includes(`${grid.width}x${grid.height}`) &&
    STILL_MIMES.includes(grid.mime) &&
    !grid.nsfw &&
    !grid.humor &&
    !grid.epilepsy &&
    isSteamGridDbImageUrl(grid.url)
  )
}

// Accepts seconds or an HTTP date, capped at 24 hours; anything unreadable
// means "no hint".
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null || value.trim() === '') return null
  let ms: number
  if (/^\d+$/.test(value.trim())) {
    ms = Number(value.trim()) * 1000
  } else {
    const date = Date.parse(value)
    if (Number.isNaN(date)) return null
    ms = Math.max(0, date - now)
  }
  return Math.min(ms, MAX_RETRY_AFTER_MS)
}

export function interpretGridResponse(response: SteamGridDbResponse, now: number): GridLookup {
  const { status, body } = response
  // Only SteamGridDB's own error body means the key is bad. steamgriddb.com
  // sits behind Cloudflare, and a challenge or proxy block page can be a 403
  // too; that must not tell the user their working key was rejected.
  if ((status === 401 || status === 403) && errorSchema.safeParse(body).success) {
    return { kind: 'keyRejected' }
  }

  if (status === 200) {
    const list = gridListSchema.safeParse(body)
    if (!list.success) {
      console.warn('[epic-covers] SteamGridDB answered in an unexpected shape')
      return { kind: 'unavailable', retryAfterMs: null }
    }
    // An empty list is SteamGridDB saying "no poster for this game".
    if (list.data.data.length === 0) return { kind: 'none' }
    // Results come best first; one malformed item only drops that item.
    for (const item of list.data.data) {
      const grid = gridSchema.safeParse(item)
      if (grid.success && isAcceptableGrid(grid.data)) return { kind: 'found', url: grid.data.url }
    }
    // Posters exist but none passed our checks, even though the query asked
    // for exactly these: SteamGridDB changed something (a new image host, a
    // new field type), or this game's posters are odd. Not "no cover" (a
    // 7-day mark could hide every game's poster for a week), and not an
    // outage either (halting the run would block every game queued after it,
    // on every sync).
    console.warn('[epic-covers] SteamGridDB returned posters in an unexpected format')
    return { kind: 'unusable' }
  }

  // A 404 only means "no cover" when it is SteamGridDB's own answer; a proxy
  // or outage page that happens to be a 404 must not be remembered as a miss.
  if (status === 404) {
    const notFound = errorSchema.safeParse(body)
    if (notFound.success && notFound.data.errors.includes('Game not found')) return { kind: 'none' }
  }

  return { kind: 'unavailable', retryAfterMs: parseRetryAfter(response.retryAfter, now) }
}

// Never rejects for network trouble; a malformed AppName is a caller bug and
// throws.
export async function lookupEpicGrid(
  appName: string,
  apiKey: string,
  signal: AbortSignal,
  deps: SteamGridDbDeps = realDeps,
  now: () => number = Date.now
): Promise<GridLookup> {
  if (!isValidCoverId('epic', appName)) throw new Error('invalid Epic AppName')
  let response: SteamGridDbResponse
  try {
    response = await deps.request(
      `/grids/egs/${encodeURIComponent(appName)}?${GRID_QUERY}`,
      apiKey,
      signal
    )
  } catch (err) {
    if (!signal.aborted) console.warn('[epic-covers] could not reach SteamGridDB:', err)
    return { kind: 'unavailable', retryAfterMs: null }
  }
  return interpretGridResponse(response, now())
}
