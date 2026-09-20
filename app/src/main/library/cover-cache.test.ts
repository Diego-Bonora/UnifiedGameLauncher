import { beforeEach, describe, expect, it, vi } from 'vitest'

// cover-cache.ts imports `app` from electron only inside functions the real
// deps use; the tests below always pass fake deps, but the import itself must
// still resolve.
vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import {
  clearCovers,
  coverFileNameForRequest,
  detectImageExtension,
  findCoverFileName,
  readBodyWithLimit,
  syncCovers,
  withLocalCoverUrls,
  type CoverCacheDeps
} from './cover-cache'
import { isSteamCoverAssetUrl } from '../stores/steam/library-cover-art'

const BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50
])

function game(
  appId: string,
  coverUrl: string | null = `${BASE}/${appId}/cap.jpg`
): { appId: string; title: string; coverUrl: string | null } {
  return { appId, title: `Game ${appId}`, coverUrl }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface FakeDeps extends CoverCacheDeps {
  written: Map<string, Uint8Array>
  deleted: string[]
  fetchImage: ReturnType<typeof vi.fn<CoverCacheDeps['fetchImage']>>
}

// listFiles reflects writes and deletes, like a real folder would.
function fakeDeps(existing: string[] = []): FakeDeps {
  const files = new Set(existing)
  const written = new Map<string, Uint8Array>()
  const deleted: string[] = []
  return {
    written,
    deleted,
    listFiles: async () => [...files],
    fetchImage: vi.fn<CoverCacheDeps['fetchImage']>(async () => JPEG),
    writeFile: async (name, bytes) => {
      files.add(name)
      written.set(name, bytes)
    },
    deleteFile: async (name) => {
      files.delete(name)
      deleted.push(name)
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

describe('detectImageExtension', () => {
  it('recognizes JPEG, PNG and WebP by their first bytes', () => {
    expect(detectImageExtension(JPEG)).toBe('jpg')
    expect(detectImageExtension(PNG)).toBe('png')
    expect(detectImageExtension(WEBP)).toBe('webp')
  })

  it('rejects an empty body', () => {
    expect(detectImageExtension(new Uint8Array(0))).toBeNull()
  })

  it('rejects an HTML page that came back as a successful response', () => {
    expect(detectImageExtension(new TextEncoder().encode('<!doctype html><html>'))).toBeNull()
  })

  it('rejects a RIFF file that is not WebP', () => {
    const wave = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
    expect(detectImageExtension(wave)).toBeNull()
  })

  it('rejects a body cut off inside the signature', () => {
    expect(detectImageExtension(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(detectImageExtension(WEBP.slice(0, 10))).toBeNull()
  })
})

describe('readBodyWithLimit', () => {
  function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      }
    })
  }

  it('joins the chunks in order', async () => {
    const bytes = await readBodyWithLimit(streamOf([1, 2], [3], [4, 5]), 100)
    expect([...bytes]).toEqual([1, 2, 3, 4, 5])
  })

  it('returns an empty result for a missing body', async () => {
    expect((await readBodyWithLimit(null, 100)).length).toBe(0)
  })

  it('allows a body of exactly the limit', async () => {
    expect((await readBodyWithLimit(streamOf([1, 2, 3, 4]), 4)).length).toBe(4)
  })

  it('stops reading and cancels as soon as the limit is passed, even for an endless body', async () => {
    let pulls = 0
    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(4))
      },
      cancel() {
        cancelled = true
      }
    })

    await expect(readBodyWithLimit(endless, 10)).rejects.toThrow('size limit')

    expect(cancelled).toBe(true)
    // A streaming stream may pre-pull a little; what matters is that it stops.
    expect(pulls).toBeLessThan(10)
  })
})

describe('syncCovers: downloading', () => {
  it('downloads a missing cover and names the file from the image bytes', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue(PNG)

    await syncCovers([game('10')], deps)

    expect([...deps.written.keys()]).toEqual(['10.png'])
  })

  it('skips a cover that is already on disk', async () => {
    const deps = fakeDeps(['10.jpg'])

    await syncCovers([game('10'), game('20')], deps)

    expect(deps.fetchImage).toHaveBeenCalledTimes(1)
    expect([...deps.written.keys()]).toEqual(['20.jpg'])
  })

  it('never requests a URL outside the Steam asset allow-list', async () => {
    const deps = fakeDeps()

    await syncCovers(
      [
        game('10', 'https://evil.test/store_item_assets/x.jpg'),
        game('20', 'http://shared.akamai.steamstatic.com/store_item_assets/x.jpg'),
        game('30', null)
      ],
      deps
    )

    expect(deps.fetchImage).not.toHaveBeenCalled()
  })

  it('does not save an empty response', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue(new Uint8Array(0))

    await syncCovers([game('10')], deps)

    expect(deps.written.size).toBe(0)
  })

  it('does not save a response that is not an image', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue(new TextEncoder().encode('<html>Access Denied</html>'))

    await syncCovers([game('10')], deps)

    expect(deps.written.size).toBe(0)
  })

  it('keeps going after one download fails, and does not throw', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(async (url) => {
      if (url.includes('/10/')) throw new Error('network down')
      return JPEG
    })

    await expect(syncCovers([game('10'), game('20')], deps)).resolves.toBeUndefined()

    expect([...deps.written.keys()]).toEqual(['20.jpg'])
  })

  it('does not throw when the covers folder cannot be listed', async () => {
    const deps = fakeDeps()
    deps.listFiles = async () => {
      throw new Error('EACCES')
    }

    await expect(syncCovers([game('10')], deps)).resolves.toBeUndefined()
    expect(deps.fetchImage).not.toHaveBeenCalled()
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
      return JPEG
    })

    await syncCovers(
      Array.from({ length: 12 }, (_, i) => game(String(i + 1))),
      deps
    )

    expect(peak).toBeLessThanOrEqual(4)
    expect(deps.written.size).toBe(12)
  })

  it('runs a second call after the first instead of dropping its games', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return JPEG
    })

    // The second call carries a game the first never saw.
    const first = syncCovers([game('10')], deps)
    const second = syncCovers([game('10'), game('20')], deps)
    await Promise.all([first, second])

    expect([...deps.written.keys()].sort()).toEqual(['10.jpg', '20.jpg'])
    // The second run saw 10.jpg already on disk and only fetched 20.
    expect(deps.fetchImage).toHaveBeenCalledTimes(2)
  })
})

describe('syncCovers: pruning', () => {
  it('removes covers for games that are no longer in the library', async () => {
    const deps = fakeDeps(['10.jpg', '99.png'])

    await syncCovers([game('10')], deps)

    expect(deps.deleted).toEqual(['99.png'])
  })

  it('removes leftover temp files and unknown files', async () => {
    const deps = fakeDeps(['10.jpg', '10.jpg.tmp', '20.png.tmp', 'notes.txt'])

    await syncCovers([game('10')], deps)

    expect(deps.deleted.sort()).toEqual(['10.jpg.tmp', '20.png.tmp', 'notes.txt'])
  })

  it('keeps the covers of every current game', async () => {
    const deps = fakeDeps(['10.jpg', '20.webp'])

    await syncCovers([game('10'), game('20')], deps)

    expect(deps.deleted).toEqual([])
    expect(deps.fetchImage).not.toHaveBeenCalled()
  })

  it('does not prune anything when the library is empty', async () => {
    const deps = fakeDeps(['10.jpg', '20.png'])

    await syncCovers([], deps)

    expect(deps.deleted).toEqual([])
  })

  it('keeps going when one stale file cannot be removed', async () => {
    const deps = fakeDeps(['98.jpg', '99.jpg'])
    const realDelete = deps.deleteFile
    deps.deleteFile = async (name) => {
      if (name === '98.jpg') throw new Error('EPERM')
      await realDelete(name)
    }

    await syncCovers([game('10')], deps)

    expect(deps.deleted).toEqual(['99.jpg'])
    expect([...deps.written.keys()]).toEqual(['10.jpg'])
  })
})

describe('clearCovers', () => {
  it('deletes every file in the covers folder', async () => {
    const deps = fakeDeps(['10.jpg', '20.png', '30.jpg.tmp'])

    await clearCovers(deps)

    expect(deps.deleted.sort()).toEqual(['10.jpg', '20.png', '30.jpg.tmp'])
  })

  it('does nothing when there is nothing to delete', async () => {
    const deps = fakeDeps()
    await expect(clearCovers(deps)).resolves.toBeUndefined()
  })

  it('throws when a file could not be removed, after trying the rest', async () => {
    const deps = fakeDeps(['10.jpg', '20.png'])
    const realDelete = deps.deleteFile
    deps.deleteFile = async (name) => {
      if (name === '10.jpg') throw new Error('EPERM')
      await realDelete(name)
    }

    await expect(clearCovers(deps)).rejects.toThrow('Could not remove all saved cover images.')
    expect(deps.deleted).toEqual(['20.png'])
  })

  it('aborts a download in progress and does not save its result', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(
      (_url, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const sync = syncCovers([game('10')], deps)
    await tick()
    await clearCovers(deps)
    await sync

    expect(deps.written.size).toBe(0)
    // An aborted download is expected, not worth a warning per game.
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('stops a sync that was queued before it from downloading afterwards', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(
      (_url, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const first = syncCovers([game('10')], deps)
    const second = syncCovers([game('20')], deps)
    await tick()
    await clearCovers(deps)
    await Promise.all([first, second])

    expect(deps.fetchImage).toHaveBeenCalledTimes(1)
    expect(deps.written.size).toBe(0)
  })

  it('does not block a sync started after it', async () => {
    const deps = fakeDeps()
    await clearCovers(deps)

    await syncCovers([game('10')], deps)

    expect([...deps.written.keys()]).toEqual(['10.jpg'])
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
