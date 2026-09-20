import { beforeEach, describe, expect, it, vi } from 'vitest'

// cover-cache.ts imports `app` from electron only inside functions the real
// deps use; the tests below always pass fake deps, but the import itself must
// still resolve.
vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import {
  coverFileNameForRequest,
  downloadMissingCovers,
  findCoverFileName,
  withLocalCoverUrls,
  type CoverCacheDeps
} from './cover-cache'
import { isSteamCoverAssetUrl } from '../stores/steam/library-cover-art'

const BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'

function game(
  appId: string,
  coverUrl: string | null = `${BASE}/${appId}/cap.jpg`
): { appId: string; title: string; coverUrl: string | null } {
  return { appId, title: `Game ${appId}`, coverUrl }
}

interface FakeDeps extends CoverCacheDeps {
  written: Map<string, Uint8Array>
  fetchImage: ReturnType<typeof vi.fn<CoverCacheDeps['fetchImage']>>
}

function fakeDeps(existing: string[] = []): FakeDeps {
  const written = new Map<string, Uint8Array>()
  return {
    written,
    listFiles: async () => [...existing, ...written.keys()],
    fetchImage: vi.fn<CoverCacheDeps['fetchImage']>(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg'
    })),
    writeFile: async (name, bytes) => {
      written.set(name, bytes)
    }
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('isSteamCoverAssetUrl', () => {
  it('accepts the Steam asset URL shape', () => {
    expect(isSteamCoverAssetUrl(`${BASE}/10/cap.jpg`)).toBe(true)
  })

  it.each([
    'https://evil.test/store_item_assets/x.jpg',
    'https://shared.akamai.steamstatic.com.evil.test/store_item_assets/x.jpg',
    'https://shared.akamai.steamstatic.com@evil.test/store_item_assets/x.jpg',
    'http://shared.akamai.steamstatic.com/store_item_assets/x.jpg',
    'https://shared.akamai.steamstatic.com/other/x.jpg',
    'data:image/png;base64,AAAA',
    ''
  ])('rejects %s', (url) => {
    expect(isSteamCoverAssetUrl(url)).toBe(false)
  })
})

describe('downloadMissingCovers', () => {
  it('downloads a missing cover and saves it as <appId>.<ext> from the content type', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue({ bytes: new Uint8Array([9]), contentType: 'image/png' })

    await downloadMissingCovers([game('10')], deps)

    expect([...deps.written.keys()]).toEqual(['10.png'])
  })

  it('accepts a content type with parameters or odd casing', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue({
      bytes: new Uint8Array([9]),
      contentType: 'Image/JPEG; charset=binary'
    })

    await downloadMissingCovers([game('10')], deps)

    expect([...deps.written.keys()]).toEqual(['10.jpg'])
  })

  it('skips a cover that is already on disk', async () => {
    const deps = fakeDeps(['10.jpg'])

    await downloadMissingCovers([game('10'), game('20')], deps)

    expect(deps.fetchImage).toHaveBeenCalledTimes(1)
    expect([...deps.written.keys()]).toEqual(['20.jpg'])
  })

  it('never requests a URL outside the Steam asset allow-list', async () => {
    const deps = fakeDeps()

    await downloadMissingCovers(
      [
        game('10', 'https://evil.test/store_item_assets/x.jpg'),
        game('20', 'http://shared.akamai.steamstatic.com/store_item_assets/x.jpg'),
        game('30', null)
      ],
      deps
    )

    expect(deps.fetchImage).not.toHaveBeenCalled()
  })

  it('does not save a response with an unsupported content type', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: 'text/html' })

    await downloadMissingCovers([game('10')], deps)

    expect(deps.written.size).toBe(0)
  })

  it('does not save a response with no content type', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: null })

    await downloadMissingCovers([game('10')], deps)

    expect(deps.written.size).toBe(0)
  })

  it('keeps going after one download fails, and does not throw', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(async (url) => {
      if (url.includes('/10/')) throw new Error('network down')
      return { bytes: new Uint8Array([1]), contentType: 'image/jpeg' }
    })

    await expect(downloadMissingCovers([game('10'), game('20')], deps)).resolves.toBeUndefined()

    expect([...deps.written.keys()]).toEqual(['20.jpg'])
  })

  it('does not throw when the covers folder cannot be listed', async () => {
    const deps = fakeDeps()
    deps.listFiles = async () => {
      throw new Error('EACCES')
    }

    await expect(downloadMissingCovers([game('10')], deps)).resolves.toBeUndefined()
  })

  it('caps how many downloads run at once', async () => {
    const deps = fakeDeps()
    let running = 0
    let peak = 0
    deps.fetchImage.mockImplementation(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return { bytes: new Uint8Array([1]), contentType: 'image/jpeg' }
    })

    await downloadMissingCovers(
      Array.from({ length: 12 }, (_, i) => game(String(i + 1))),
      deps
    )

    expect(peak).toBeLessThanOrEqual(4)
    expect(deps.written.size).toBe(12)
  })

  it('joins a download already in progress instead of starting a second one', async () => {
    const deps = fakeDeps()
    let release: () => void = () => undefined
    deps.fetchImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ bytes: new Uint8Array([1]), contentType: 'image/jpeg' })
        })
    )

    const first = downloadMissingCovers([game('10')], deps)
    const second = downloadMissingCovers([game('10')], deps)
    // Let the first run reach its fetch before releasing it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    await Promise.all([first, second])

    expect(deps.fetchImage).toHaveBeenCalledTimes(1)
  })
})

describe('withLocalCoverUrls', () => {
  it('points at the local cover when the file exists and keeps the remote URL otherwise', async () => {
    const deps = fakeDeps(['10.jpg'])

    const result = await withLocalCoverUrls([game('10'), game('20'), game('30', null)], deps)

    expect(result.map((g) => g.coverUrl)).toEqual([
      'app-cover://covers/10',
      `${BASE}/20/cap.jpg`,
      null
    ])
  })

  it('ignores leftover temp files', async () => {
    const deps = fakeDeps(['10.jpg.tmp'])

    const [result] = await withLocalCoverUrls([game('10')], deps)

    expect(result?.coverUrl).toBe(`${BASE}/10/cap.jpg`)
  })
})

describe('findCoverFileName', () => {
  it('matches only exact <appId>.<known extension> names', () => {
    const files = new Set(['10.webp', '20.gif', '30.jpg.tmp', '40'])
    expect(findCoverFileName('10', files)).toBe('10.webp')
    expect(findCoverFileName('20', files)).toBeNull()
    expect(findCoverFileName('30', files)).toBeNull()
    expect(findCoverFileName('40', files)).toBeNull()
  })
})

describe('coverFileNameForRequest', () => {
  const files = new Set(['10.jpg', '20.png'])

  it('resolves a well-formed request for a cached cover', () => {
    expect(coverFileNameForRequest('app-cover://covers/10', files)).toBe('10.jpg')
    expect(coverFileNameForRequest('app-cover://covers/20', files)).toBe('20.png')
  })

  it('returns null for a cover that is not cached', () => {
    expect(coverFileNameForRequest('app-cover://covers/999', files)).toBeNull()
  })

  it('only ever resolves a normalized ..-path to a cover inside the folder', () => {
    // The URL parser collapses this to "/10". That is still a legitimate
    // cached cover; the file name is rebuilt from the digits, so nothing
    // outside the covers folder can be named.
    expect(coverFileNameForRequest('app-cover://covers/%2e%2e/10', files)).toBe('10.jpg')
  })

  it.each([
    ['a different host', 'app-cover://other/10'],
    ['a different scheme', 'https://covers/10'],
    ['a non-numeric id', 'app-cover://covers/abc'],
    ['a file name instead of an id', 'app-cover://covers/10.jpg'],
    ['a nested path', 'app-cover://covers/10/extra'],
    ['a traversal attempt', 'app-cover://covers/..%2F..%2Fsecrets'],
    ['an encoded traversal out of the folder', 'app-cover://covers/%2e%2e/%2e%2e/etc/passwd'],
    ['a query-only trick', 'app-cover://covers/?/10'],
    ['no path', 'app-cover://covers'],
    ['garbage', 'not a url']
  ])('returns null for %s', (_label, url) => {
    expect(coverFileNameForRequest(url, files)).toBeNull()
  })
})
