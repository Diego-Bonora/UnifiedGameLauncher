import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanInstalledSteamGames, steamProvider, type SteamFsDeps } from './steam-provider'

const manifest = (appId: string, name: string, installDir: string): string => `
  "AppState"
  {
    "appid"		"${appId}"
    "name"		"${name}"
    "installdir"		"${installDir}"
  }
`

// Shaped like node's own error, with the `code` the scan checks.
function missing(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
}

function fakeFs(files: Record<string, string>, dirs: Record<string, string[]>): SteamFsDeps {
  return {
    readFile: async (path) => {
      const content = files[path]
      if (content === undefined) throw missing(path)
      return content
    },
    readdir: async (path) => {
      const entries = dirs[path]
      if (entries === undefined) throw missing(path)
      return entries
    }
  }
}

// Every game the scan found, in library order.
async function scannedGames(steamPath: string, fs: SteamFsDeps): Promise<unknown[]> {
  const scan = await scanInstalledSteamGames(steamPath, fs)
  return scan.libraries.flatMap((library) => library.games)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scanInstalledSteamGames', () => {
  it('returns an empty, complete scan when no Steam install was found', async () => {
    expect(await scanInstalledSteamGames(null)).toEqual({
      libraries: [],
      libraryListReadable: true
    })
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

    expect(await scanInstalledSteamGames(steamPath, fs)).toEqual({
      libraries: [
        {
          path: steamPath,
          readable: true,
          games: [
            {
              storeGameId: '440',
              title: 'Team Fortress 2',
              installPath: join(mainSteamapps, 'common', 'Team Fortress 2')
            }
          ]
        },
        {
          path: otherLibrary,
          readable: true,
          games: [
            {
              storeGameId: '570',
              title: 'Dota 2',
              installPath: join(otherSteamapps, 'common', 'dota 2 beta')
            }
          ]
        }
      ],
      libraryListReadable: true
    })
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

    const scan = await scanInstalledSteamGames(steamPath, fs)
    expect(scan.libraryListReadable).toBe(true)
    expect(scan.libraries).toHaveLength(1)
    expect(scan.libraries[0]?.path).toBe(steamPath)
    expect(scan.libraries[0]?.games.map((game) => game.storeGameId)).toEqual(['440'])
  })

  it('marks a library that fails to read as unreadable, keeping the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
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

    const scan = await scanInstalledSteamGames(steamPath, fs)
    expect(scan.libraries).toEqual([
      {
        path: steamPath,
        readable: true,
        games: [
          {
            storeGameId: '440',
            title: 'Team Fortress 2',
            installPath: join(mainSteamapps, 'common', 'Team Fortress 2')
          }
        ]
      },
      // Not "no games": the caller must be able to tell this apart.
      { path: otherLibrary, readable: false, games: [] }
    ])
    expect(scan.libraryListReadable).toBe(true)
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

    const scan = await scanInstalledSteamGames(steamPath, fs)
    // The first library listed keeps the game; the second shows none.
    expect(scan.libraries.map((library) => library.games.length)).toEqual([1, 0])
  })

  it('reports an unreadable libraryfolders.vdf, still scanning the main folder', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const steamPath = '/Steam'
    const steamapps = join(steamPath, 'steamapps')
    const base = fakeFs(
      { [join(steamapps, 'appmanifest_440.acf')]: manifest('440', 'Team Fortress 2', 'TF2') },
      { [steamapps]: ['appmanifest_440.acf'] }
    )
    const fs: SteamFsDeps = {
      ...base,
      readFile: async (path) => {
        // A locked or unreadable file, not a missing one.
        if (path.endsWith('libraryfolders.vdf')) {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
        }
        return base.readFile(path)
      }
    }

    const scan = await scanInstalledSteamGames(steamPath, fs)
    expect(scan.libraryListReadable).toBe(false)
    expect(await scannedGames(steamPath, fs)).toHaveLength(1)
  })

  it('does not call the library list complete when the Steam drive itself is gone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // An unplugged drive answers "not found" for libraryfolders.vdf too, which
    // would otherwise look like a fresh install with no other libraries.
    const scan = await scanInstalledSteamGames('/Unplugged/Steam', fakeFs({}, {}))
    expect(scan.libraries).toEqual([{ path: '/Unplugged/Steam', readable: false, games: [] }])
    expect(scan.libraryListReadable).toBe(false)
  })

  it('skips one unreadable manifest without marking its library unreadable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const steamPath = '/Steam'
    const steamapps = join(steamPath, 'steamapps')
    const fs = fakeFs(
      { [join(steamapps, 'appmanifest_440.acf')]: manifest('440', 'Team Fortress 2', 'TF2') },
      // appmanifest_570.acf is listed but has no content: its read fails.
      { [steamapps]: ['appmanifest_440.acf', 'appmanifest_570.acf'] }
    )

    const scan = await scanInstalledSteamGames(steamPath, fs)
    expect(scan.libraries).toHaveLength(1)
    expect(scan.libraries[0]?.readable).toBe(true)
    expect(scan.libraries[0]?.games.map((game) => game.storeGameId)).toEqual(['440'])
  })
})

describe('steamProvider URLs', () => {
  it('builds the launch and install URLs from the app id', () => {
    expect(steamProvider.getLaunchUrl('440')).toBe('steam://rungameid/440')
    expect(steamProvider.getInstallUrl?.('440')).toBe('steam://install/440')
  })

  it('encodes the id instead of trusting every caller to have checked it', () => {
    expect(steamProvider.getLaunchUrl('1/../x')).toBe('steam://rungameid/1%2F..%2Fx')
    expect(steamProvider.getInstallUrl?.('1?a=b')).toBe('steam://install/1%3Fa%3Db')
  })
})
