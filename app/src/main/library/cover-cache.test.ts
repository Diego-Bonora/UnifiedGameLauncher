import { beforeEach, describe, expect, it, vi } from 'vitest'

// cover-cache.ts imports `app` from electron only inside functions the real
// deps use; the tests below always pass fake deps, but the import itself must
// still resolve.
vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import { clearCovers, syncCovers, withLocalCoverUrls, type CoverCacheDeps } from './cover-cache'
import { isSteamCoverAssetUrl } from '../stores/steam/library-cover-art'

const BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

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

    await expect(syncCovers([game('10'), game('20')], deps)).resolves.toBe(1)

    expect([...deps.written.keys()]).toEqual(['20.jpg'])
  })

  it('does not throw when the covers folder cannot be listed', async () => {
    const deps = fakeDeps()
    deps.listFiles = async () => {
      throw new Error('EACCES')
    }

    await expect(syncCovers([game('10')], deps)).resolves.toBe(0)
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

describe('syncCovers: how many were saved', () => {
  it('reports the number of newly saved covers', async () => {
    const deps = fakeDeps()
    expect(await syncCovers([game('10'), game('20'), game('30')], deps)).toBe(3)
  })

  it('reports 0 when everything is already on disk', async () => {
    const deps = fakeDeps(['10.jpg', '20.jpg'])
    expect(await syncCovers([game('10'), game('20')], deps)).toBe(0)
  })

  it('does not count downloads that were rejected as not-an-image', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockImplementation(async (url) =>
      url.includes('/10/') ? new Uint8Array(0) : JPEG
    )
    expect(await syncCovers([game('10'), game('20')], deps)).toBe(1)
  })

  it('does not count a cover whose write failed', async () => {
    const deps = fakeDeps()
    deps.writeFile = async () => {
      throw new Error('disk full')
    }
    expect(await syncCovers([game('10')], deps)).toBe(0)
  })

  it('reports 0 when pruning is all that happened', async () => {
    const deps = fakeDeps(['10.jpg', '99.png'])
    expect(await syncCovers([game('10')], deps)).toBe(0)
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
