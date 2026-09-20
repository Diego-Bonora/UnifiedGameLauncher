import { describe, expect, it } from 'vitest'
import { getOwnedSteamGames, type OwnedGamesHttpDeps } from './owned-games'

function fakeHttp(response: unknown): OwnedGamesHttpDeps {
  return { fetchOwnedGames: async () => response }
}

describe('getOwnedSteamGames', () => {
  it('parses appid/name into appId/title', async () => {
    const http = fakeHttp({
      response: { game_count: 1, games: [{ appid: 220, name: 'Half-Life 2' }] }
    })
    expect(await getOwnedSteamGames('123', 'key', http)).toEqual([
      { appId: '220', title: 'Half-Life 2' }
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
    expect(await getOwnedSteamGames('123', 'key', http)).toEqual([
      { appId: '220', title: 'Half-Life 2' }
    ])
  })

  it('returns an empty array when the profile has no games', async () => {
    const http = fakeHttp({ response: {} })
    expect(await getOwnedSteamGames('123', 'key', http)).toEqual([])
  })

  it('returns an empty array for an unexpected response shape', async () => {
    expect(await getOwnedSteamGames('123', 'key', fakeHttp('not an object'))).toEqual([])
    expect(await getOwnedSteamGames('123', 'key', fakeHttp(null))).toEqual([])
  })

  it('propagates an error from the http dependency instead of swallowing it', async () => {
    const http: OwnedGamesHttpDeps = {
      fetchOwnedGames: async () => {
        throw new Error('Steam API responded with 403')
      }
    }
    await expect(getOwnedSteamGames('123', 'key', http)).rejects.toThrow(
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
    await getOwnedSteamGames('76561197960287930', 'abc123', http)
    expect(received).toEqual(['76561197960287930', 'abc123'])
  })
})
