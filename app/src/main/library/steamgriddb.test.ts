import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import {
  interpretGridResponse,
  isSteamGridDbImageUrl,
  lookupEpicGrid,
  parseRetryAfter,
  type SteamGridDbDeps,
  type SteamGridDbResponse
} from './steamgriddb'

// Real answers captured on 2026-10-02 for Rocket League (AppName "Sugar") and
// Bloons TD 6, trimmed to the fields that matter; the uploader's name and
// Steam id are left out.
const ROCKET_LEAGUE_GRID = {
  id: 87950,
  score: 0,
  style: 'alternate',
  width: 600,
  height: 900,
  nsfw: false,
  humor: false,
  notes: 'Original backup from 2019-08-11',
  mime: 'image/png',
  language: 'en',
  url: 'https://cdn2.steamgriddb.com/grid/e4e4005042cf598805d581754fe9256f.png',
  thumb: 'https://cdn2.steamgriddb.com/thumb/e4e4005042cf598805d581754fe9256f.jpg',
  lock: false,
  epilepsy: false,
  upvotes: 0,
  downvotes: 0
}
const FOUND_BODY = { success: true, page: 0, total: 157, limit: 50, data: [ROCKET_LEAGUE_GRID] }
const NOT_FOUND_BODY = { success: false, status: 404, errors: ['Game not found'] }
const BAD_KEY_BODY = { success: false, errors: ['Invalid API key'] }

const NOW = 1_000_000

function answer(
  status: number,
  body: unknown,
  retryAfter: string | null = null
): SteamGridDbResponse {
  return { status, body, retryAfter }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('interpretGridResponse', () => {
  it('returns the first poster from a real answer', () => {
    expect(interpretGridResponse(answer(200, FOUND_BODY), NOW)).toEqual({
      kind: 'found',
      url: ROCKET_LEAGUE_GRID.url
    })
  })

  it('treats SteamGridDB\'s own "Game not found" as no cover', () => {
    expect(interpretGridResponse(answer(404, NOT_FOUND_BODY), NOW)).toEqual({ kind: 'none' })
  })

  it('treats an empty result list as no cover', () => {
    expect(interpretGridResponse(answer(200, { ...FOUND_BODY, data: [] }), NOW)).toEqual({
      kind: 'none'
    })
  })

  it("reports a rejected key for SteamGridDB's own 401 or 403", () => {
    expect(interpretGridResponse(answer(401, BAD_KEY_BODY), NOW)).toEqual({ kind: 'keyRejected' })
    expect(interpretGridResponse(answer(403, BAD_KEY_BODY), NOW)).toEqual({ kind: 'keyRejected' })
  })

  it('does not blame the key for a 401 or 403 that SteamGridDB did not send', () => {
    // A Cloudflare challenge or proxy block page: not JSON, or not its shape.
    expect(interpretGridResponse(answer(403, null), NOW).kind).toBe('unavailable')
    expect(interpretGridResponse(answer(401, { message: 'blocked' }), NOW).kind).toBe('unavailable')
  })

  it("does not count a 404 that is not SteamGridDB's answer as no cover", () => {
    expect(interpretGridResponse(answer(404, null), NOW)).toEqual({
      kind: 'unavailable',
      retryAfterMs: null
    })
    expect(
      interpretGridResponse(answer(404, { success: false, errors: ['Other'] }), NOW).kind
    ).toBe('unavailable')
  })

  it('does not count a 200 in an unexpected shape as no cover', () => {
    expect(interpretGridResponse(answer(200, '<html>'), NOW).kind).toBe('unavailable')
    expect(interpretGridResponse(answer(200, { success: true }), NOW).kind).toBe('unavailable')
  })

  it('reports rate limits and server trouble as unavailable, with the retry hint', () => {
    expect(interpretGridResponse(answer(429, null, '120'), NOW)).toEqual({
      kind: 'unavailable',
      retryAfterMs: 120_000
    })
    expect(interpretGridResponse(answer(503, null), NOW)).toEqual({
      kind: 'unavailable',
      retryAfterMs: null
    })
  })

  it('skips a malformed item and uses the next good one', () => {
    const second = { ...ROCKET_LEAGUE_GRID, url: 'https://cdn2.steamgriddb.com/grid/abc123.jpg' }
    const body = { ...FOUND_BODY, data: [{ url: 42 }, second] }
    expect(interpretGridResponse(answer(200, body), NOW)).toEqual({
      kind: 'found',
      url: second.url
    })
  })

  it.each([
    ['a landscape banner', { width: 920, height: 430 }],
    ['an animated or other format', { mime: 'image/webp' }],
    ['an nsfw-tagged image', { nsfw: true }],
    ['a humor-tagged image', { humor: true }],
    ['an epilepsy-tagged image', { epilepsy: true }],
    ['an image on another host', { url: 'https://evil.example/grid/abc.png' }]
  ])('never picks %s even if the server returns one', (_label, change) => {
    const body = { ...FOUND_BODY, data: [{ ...ROCKET_LEAGUE_GRID, ...change }] }
    expect(interpretGridResponse(answer(200, body), NOW).kind).not.toBe('found')
  })

  it('reports posters it cannot use as unusable: not no cover, not an outage', () => {
    // E.g. SteamGridDB moved images to a new host: "no cover" would hide
    // every game's poster for 7 days, and "unavailable" would halt the run.
    const moved = { ...ROCKET_LEAGUE_GRID, url: 'https://cdn3.steamgriddb.com/grid/abc.png' }
    const body = { ...FOUND_BODY, data: [moved, { url: 42 }] }
    expect(interpretGridResponse(answer(200, body), NOW)).toEqual({ kind: 'unusable' })
  })
})

describe('isSteamGridDbImageUrl', () => {
  it('accepts the real full-size URL shape', () => {
    expect(isSteamGridDbImageUrl(ROCKET_LEAGUE_GRID.url)).toBe(true)
    expect(isSteamGridDbImageUrl('https://cdn2.steamgriddb.com/grid/abc.jpeg')).toBe(true)
  })

  it.each([
    'http://cdn2.steamgriddb.com/grid/abc.png',
    'https://cdn2.steamgriddb.com.evil.example/grid/abc.png',
    'https://user@cdn2.steamgriddb.com/grid/abc.png',
    'https://cdn2.steamgriddb.com:8443/grid/abc.png',
    'https://cdn2.steamgriddb.com/grid/abc.png?x=1',
    'https://cdn2.steamgriddb.com/grid/../abc.png',
    'https://cdn2.steamgriddb.com/grid/abc.webp',
    'https://cdn2.steamgriddb.com/other/abc.png',
    'not a url'
  ])('rejects %s', (url) => {
    expect(isSteamGridDbImageUrl(url)).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('30', NOW)).toBe(30_000)
    expect(parseRetryAfter(new Date(NOW + 5000).toUTCString(), NOW)).toBe(5000)
  })

  it('caps the wait at 24 hours', () => {
    expect(parseRetryAfter('99999999', NOW)).toBe(24 * 60 * 60 * 1000)
    expect(parseRetryAfter(new Date(NOW + 400 * 86_400_000).toUTCString(), NOW)).toBe(
      24 * 60 * 60 * 1000
    )
  })

  it('returns null for a missing or unreadable value', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull()
    expect(parseRetryAfter('soon', NOW)).toBeNull()
  })
})

describe('lookupEpicGrid', () => {
  function deps(result: SteamGridDbResponse | Error): SteamGridDbDeps & {
    request: ReturnType<typeof vi.fn<SteamGridDbDeps['request']>>
  } {
    return {
      request: vi.fn<SteamGridDbDeps['request']>(async () => {
        if (result instanceof Error) throw result
        return result
      })
    }
  }

  it('asks for posters of the game by its AppName, with the key', async () => {
    const fake = deps(answer(200, FOUND_BODY))

    const result = await lookupEpicGrid('Sugar', 'k'.repeat(32), new AbortController().signal, fake)

    expect(result.kind).toBe('found')
    const [path, key] = fake.request.mock.calls[0] ?? []
    expect(path).toMatch(/^\/grids\/egs\/Sugar\?/)
    expect(path).toContain('dimensions=600x900%2C342x482%2C660x930')
    expect(path).toContain('types=static')
    expect(path).toContain('nsfw=false')
    expect(key).toBe('k'.repeat(32))
  })

  it('reports a network failure as unavailable instead of throwing', async () => {
    const result = await lookupEpicGrid(
      'Sugar',
      'key',
      new AbortController().signal,
      deps(new TypeError('fetch failed'))
    )
    expect(result).toEqual({ kind: 'unavailable', retryAfterMs: null })
  })

  it('refuses an AppName that could change the request path', async () => {
    const fake = deps(answer(200, FOUND_BODY))
    await expect(
      lookupEpicGrid('../games/id/1', 'key', new AbortController().signal, fake)
    ).rejects.toThrow()
    expect(fake.request).not.toHaveBeenCalled()
  })
})

describe('lookupEpicGrid with the real request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gives up on an oversized answer and reports it as unavailable', async () => {
    const huge = new Uint8Array(2 * 1024 * 1024).fill(0x20)
    vi.stubGlobal('fetch', async () => new Response(huge, { status: 200 }))

    const result = await lookupEpicGrid('Sugar', 'key', new AbortController().signal)

    expect(result).toEqual({ kind: 'unavailable', retryAfterMs: null })
  })

  it('reads a real-shaped answer', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(FOUND_BODY), { status: 200 }))

    const result = await lookupEpicGrid('Sugar', 'key', new AbortController().signal)

    expect(result).toEqual({ kind: 'found', url: ROCKET_LEAGUE_GRID.url })
  })

  it('treats a non-JSON block page as unavailable', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>blocked</html>', { status: 403 }))

    const result = await lookupEpicGrid('Sugar', 'key', new AbortController().signal)

    expect(result.kind).toBe('unavailable')
  })
})
