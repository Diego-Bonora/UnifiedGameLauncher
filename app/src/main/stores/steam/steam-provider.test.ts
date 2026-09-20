import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getInstalledSteamGames, type SteamFsDeps } from './steam-provider'

const manifest = (appId: string, name: string, installDir: string): string => `
  "AppState"
  {
    "appid"		"${appId}"
    "name"		"${name}"
    "installdir"		"${installDir}"
  }
`

function fakeFs(files: Record<string, string>, dirs: Record<string, string[]>): SteamFsDeps {
  return {
    readFile: async (path) => {
      const content = files[path]
      if (content === undefined) throw new Error(`ENOENT: ${path}`)
      return content
    },
    readdir: async (path) => {
      const entries = dirs[path]
      if (entries === undefined) throw new Error(`ENOENT: ${path}`)
      return entries
    }
  }
}

describe('getInstalledSteamGames', () => {
  it('returns an empty list when no Steam install was found', async () => {
    expect(await getInstalledSteamGames(null)).toEqual([])
  })

  it('reads games from every library listed in libraryfolders.vdf', async () => {
    const steamPath = '/Steam'
    const otherLibrary = '/D/SteamLibrary'
    const libraryFoldersPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
    const mainSteamapps = join(steamPath, 'steamapps')
    const otherSteamapps = join(otherLibrary, 'steamapps')

    const fs = fakeFs(
      {
        [libraryFoldersPath]: `
          "libraryfolders"
          {
            "0" { "path" "${steamPath}" }
            "1" { "path" "${otherLibrary}" }
          }
        `,
        [join(mainSteamapps, 'appmanifest_440.acf')]: manifest(
          '440',
          'Team Fortress 2',
          'Team Fortress 2'
        ),
        [join(otherSteamapps, 'appmanifest_570.acf')]: manifest('570', 'Dota 2', 'dota 2 beta')
      },
      {
        [mainSteamapps]: ['appmanifest_440.acf', 'libraryfolders.vdf', 'not-a-manifest.txt'],
        [otherSteamapps]: ['appmanifest_570.acf']
      }
    )

    const games = await getInstalledSteamGames(steamPath, fs)

    expect(games).toEqual([
      {
        storeGameId: '440',
        title: 'Team Fortress 2',
        installPath: join(mainSteamapps, 'common', 'Team Fortress 2')
      },
      {
        storeGameId: '570',
        title: 'Dota 2',
        installPath: join(otherSteamapps, 'common', 'dota 2 beta')
      }
    ])
  })

  it('falls back to the Steam path itself when libraryfolders.vdf is missing', async () => {
    const steamPath = '/Steam'
    const steamapps = join(steamPath, 'steamapps')
    const fs = fakeFs(
      {
        [join(steamapps, 'appmanifest_440.acf')]: manifest(
          '440',
          'Team Fortress 2',
          'Team Fortress 2'
        )
      },
      {
        [steamapps]: ['appmanifest_440.acf']
      }
    )

    const games = await getInstalledSteamGames(steamPath, fs)
    expect(games).toHaveLength(1)
    expect(games[0]?.storeGameId).toBe('440')
  })

  it('skips a library that fails to read instead of failing the whole scan', async () => {
    const steamPath = '/Steam'
    const otherLibrary = '/Missing'
    const libraryFoldersPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
    const mainSteamapps = join(steamPath, 'steamapps')

    const fs = fakeFs(
      {
        [libraryFoldersPath]: `
          "libraryfolders"
          {
            "0" { "path" "${steamPath}" }
            "1" { "path" "${otherLibrary}" }
          }
        `,
        [join(mainSteamapps, 'appmanifest_440.acf')]: manifest(
          '440',
          'Team Fortress 2',
          'Team Fortress 2'
        )
      },
      {
        [mainSteamapps]: ['appmanifest_440.acf']
        // otherLibrary's steamapps folder deliberately has no readdir entry.
      }
    )

    const games = await getInstalledSteamGames(steamPath, fs)
    expect(games).toEqual([
      {
        storeGameId: '440',
        title: 'Team Fortress 2',
        installPath: join(mainSteamapps, 'common', 'Team Fortress 2')
      }
    ])
  })

  it('de-dupes the same appId if it turns up in two different libraries', async () => {
    const steamPath = '/Steam'
    const otherLibrary = '/SteamLibrary2'
    const steamapps = join(steamPath, 'steamapps')
    const otherSteamapps = join(otherLibrary, 'steamapps')
    const fs = fakeFs(
      {
        [join(steamPath, 'steamapps', 'libraryfolders.vdf')]: `
          "libraryfolders"
          {
            "0" { "path" "${steamPath}" }
            "1" { "path" "${otherLibrary}" }
          }
        `,
        [join(steamapps, 'appmanifest_440.acf')]: manifest(
          '440',
          'Team Fortress 2',
          'Team Fortress 2'
        ),
        [join(otherSteamapps, 'appmanifest_440.acf')]: manifest(
          '440',
          'Team Fortress 2',
          'Team Fortress 2'
        )
      },
      {
        [steamapps]: ['appmanifest_440.acf'],
        [otherSteamapps]: ['appmanifest_440.acf']
      }
    )

    const games = await getInstalledSteamGames(steamPath, fs)
    expect(games).toHaveLength(1)
  })
})
