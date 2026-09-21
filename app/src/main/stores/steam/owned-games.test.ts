import { describe, expect, it } from 'vitest'
import {
  getOwnedSteamGames,
  problemForFetchError,
  problemForStatus,
  SteamApiError,
  type OwnedGamesHttpDeps
} from './owned-games'
import type { LibraryCoverArtHttpDeps } from './library-cover-art'

function fakeHttp(response: unknown): OwnedGamesHttpDeps {
  return { fetchOwnedGames: async () => response }
}

// Returns no cover art for anything — keeps tests focused on
// getOwnedSteamGames's own logic without a real network call, and without
// needing to model library-cover-art.ts's response shape in every test.
const noCoverArt: LibraryCoverArtHttpDeps = {
  fetchStoreItems: async () => ({ response: { store_items: [] } })
}

describe('getOwnedSteamGames', () => {
  it('parses appid/name into appId/title', async () => {
    const http = fakeHttp({
      response: { game_count: 1, games: [{ appid: 220, name: 'Half-Life 2' }] }
    })
    expect(await getOwnedSteamGames('123', 'key', http, noCoverArt)).toEqual([
      { appId: '220', title: 'Half-Life 2', coverUrl: null }
    ])
  })

  it('drops a malformed entry instead of failing the whole list', async () => {
    const http = fakeHttp({
      response: {
        games: [
          { appid: 220, name: 'Half-Life 2' },
          { appid: 'not-a-number', name: 'Broken' },
          { appid: 400, name: '' }
        ]
      }
    })
    expect(await getOwnedSteamGames('123', 'key', http, noCoverArt)).toEqual([
      { appId: '220', title: 'Half-Life 2', coverUrl: null }
    ])
  })

  it('returns an empty array when the profile has no games', async () => {
    const http = fakeHttp({ response: {} })
    expect(await getOwnedSteamGames('123', 'key', http, noCoverArt)).toEqual([])
  })

  it('returns an empty array for an unexpected response shape', async () => {
    expect(await getOwnedSteamGames('123', 'key', fakeHttp('not an object'), noCoverArt)).toEqual(
      []
    )
    expect(await getOwnedSteamGames('123', 'key', fakeHttp(null), noCoverArt)).toEqual([])
  })

  it('propagates an error from the http dependency instead of swallowing it', async () => {
    const http: OwnedGamesHttpDeps = {
      fetchOwnedGames: async () => {
        throw new Error('Steam API responded with 403')
      }
    }
    await expect(getOwnedSteamGames('123', 'key', http, noCoverArt)).rejects.toThrow(
      'Steam API responded with 403'
    )
  })

  it('passes the steamId64 and apiKey through to the request', async () => {
    let received: [string, string] | null = null
    const http: OwnedGamesHttpDeps = {
      fetchOwnedGames: async (steamId64, apiKey) => {
        received = [steamId64, apiKey]
        return { response: { games: [] } }
      }
    }
    await getOwnedSteamGames('76561197960287930', 'abc123', http, noCoverArt)
    expect(received).toEqual(['76561197960287930', 'abc123'])
  })

  it('attaches the looked-up cover art URL to the matching game', async () => {
    const http = fakeHttp({
      response: { games: [{ appid: 220, name: 'Half-Life 2' }] }
    })
    const coverArtHttp: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async (appIds) => ({
        response: {
          store_items: appIds.map((appId) => ({
            appid: Number(appId),
            assets: {
              asset_url_format: `steam/apps/${appId}/\${FILENAME}`,
              library_capsule: 'library_600x900.jpg'
            }
          }))
        }
      })
    }
    expect(await getOwnedSteamGames('123', 'key', http, coverArtHttp)).toEqual([
      {
        appId: '220',
        title: 'Half-Life 2',
        coverUrl:
          'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/220/library_600x900.jpg'
      }
    ])
  })

  it('does not look up cover art when there are no games', async () => {
    let called = false
    const coverArtHttp: LibraryCoverArtHttpDeps = {
      fetchStoreItems: async () => {
        called = true
        return { response: { store_items: [] } }
      }
    }
    await getOwnedSteamGames('123', 'key', fakeHttp({ response: { games: [] } }), coverArtHttp)
    expect(called).toBe(false)
  })
})

describe('problemForStatus', () => {
  it.each([401, 403])('treats %i as Steam rejecting the key', (status) => {
    expect(problemForStatus(status)).toBe('keyRejected')
  })

  it.each([400, 404, 429, 500, 502, 503])(
    'does not blame the key for %i (Steam being unwell says nothing about it)',
    (status) => {
      expect(problemForStatus(status)).toBe('unavailable')
    }
  )
})

describe('problemForFetchError', () => {
  it('treats a failed connection (what fetch throws when offline) as offline', () => {
    expect(problemForFetchError(new TypeError('fetch failed'))).toBe('offline')
  })

  it('treats our own timeout as unavailable, not offline', () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(problemForFetchError(timeout)).toBe('unavailable')
  })

  it('recognizes the error a real AbortSignal.timeout produces', async () => {
    // The hand-built DOMException above matches what we THINK Node throws;
    // this uses the real thing so a runtime change would show up here.
    const signal = AbortSignal.timeout(1)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(problemForFetchError(signal.reason)).toBe('unavailable')
  })

  it('treats a non-Error rejection as offline rather than crashing', () => {
    expect(problemForFetchError('boom')).toBe('offline')
    expect(problemForFetchError(undefined)).toBe('offline')
  })
})

describe('SteamApiError', () => {
  it('carries the problem and is still an Error', () => {
    const err = new SteamApiError('keyRejected', 'Steam API responded with 403')
    expect(err).toBeInstanceOf(Error)
    expect(err.problem).toBe('keyRejected')
    expect(err.message).toBe('Steam API responded with 403')
  })
})
