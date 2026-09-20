import { describe, expect, it } from 'vitest'
import {
  clearCachedSteamLibrary,
  getCachedSteamLibrary,
  setCachedSteamLibrary,
  type LibraryCacheDeps
} from './library-cache'

const STEAM_ID = '76561197960287930'
const OTHER_STEAM_ID = '76561197960287931'

const GAMES = [
  { appId: '10', title: 'Counter-Strike', coverUrl: 'https://example.test/10.jpg' },
  { appId: '20', title: 'Team Fortress Classic', coverUrl: null }
]

function fakeDeps(initial?: string): LibraryCacheDeps & { content: () => string | undefined } {
  let content = initial
  return {
    readFile: async () => {
      if (content === undefined) throw new Error('ENOENT: library-cache.json')
      return content
    },
    writeFile: async (data) => {
      content = data
    },
    content: () => content
  }
}

describe('library-cache', () => {
  it('returns null when the file does not exist', async () => {
    expect(await getCachedSteamLibrary(STEAM_ID, fakeDeps())).toBeNull()
  })

  it('returns null when the file is corrupt JSON', async () => {
    expect(await getCachedSteamLibrary(STEAM_ID, fakeDeps('not json'))).toBeNull()
  })

  it('returns null when the saved shape fails validation', async () => {
    const deps = fakeDeps(JSON.stringify({ steam: { steamId64: STEAM_ID, games: 'nope' } }))
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toBeNull()
  })

  it('round-trips a saved library', async () => {
    const deps = fakeDeps()
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toEqual(GAMES)
  })

  it('does not return another account’s cache', async () => {
    const deps = fakeDeps()
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)
    expect(await getCachedSteamLibrary(OTHER_STEAM_ID, deps)).toBeNull()
  })

  it('replaces the previous library on a new save', async () => {
    const deps = fakeDeps()
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)
    await setCachedSteamLibrary(STEAM_ID, [GAMES[0]!], deps)
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toEqual([GAMES[0]])
  })

  it('records when it was fetched', async () => {
    const deps = fakeDeps()
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps, () => 1234)
    expect(JSON.parse(deps.content()!).steam.fetchedAt).toBe(1234)
  })

  it('preserves other top-level keys (e.g. a future epic cache) when writing', async () => {
    const deps = fakeDeps(JSON.stringify({ epic: { foo: 'bar' } }))
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)
    expect(JSON.parse(deps.content()!).epic).toEqual({ foo: 'bar' })
  })

  it('treats an entry from a different cache version as no cache', async () => {
    const deps = fakeDeps(
      JSON.stringify({ steam: { version: 999, steamId64: STEAM_ID, fetchedAt: 1, games: GAMES } })
    )
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toBeNull()
  })

  it('treats a pre-version entry as no cache', async () => {
    const deps = fakeDeps(
      JSON.stringify({ steam: { steamId64: STEAM_ID, fetchedAt: 1, games: GAMES } })
    )
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toBeNull()
  })

  it('clears only the steam entry', async () => {
    const deps = fakeDeps(JSON.stringify({ epic: { foo: 'bar' } }))
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)

    await clearCachedSteamLibrary(deps)

    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toBeNull()
    expect(JSON.parse(deps.content()!)).toEqual({ epic: { foo: 'bar' } })
  })

  it('clearing with nothing cached does not write', async () => {
    let writes = 0
    const deps: LibraryCacheDeps = {
      readFile: async () => {
        throw new Error('ENOENT')
      },
      writeFile: async () => {
        writes++
      }
    }
    await clearCachedSteamLibrary(deps)
    expect(writes).toBe(0)
  })

  it('propagates a write failure and keeps the queue usable afterwards', async () => {
    let fail = true
    let content: string | undefined
    const deps: LibraryCacheDeps = {
      readFile: async () => {
        if (content === undefined) throw new Error('ENOENT')
        return content
      },
      writeFile: async (data) => {
        if (fail) throw new Error('disk full')
        content = data
      }
    }

    await expect(setCachedSteamLibrary(STEAM_ID, GAMES, deps)).rejects.toThrow('disk full')

    fail = false
    await setCachedSteamLibrary(STEAM_ID, GAMES, deps)
    expect(await getCachedSteamLibrary(STEAM_ID, deps)).toEqual(GAMES)
  })
})
