import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAppManifest } from './app-manifest'
import { parseLibraryFolders } from './library-folders'
import { getSteamInstallPath } from './steam-registry'
import type { InstalledGame, StoreProvider } from '../store-provider'

// Filesystem calls as an injectable dependency: real node:fs/promises by
// default, fakes in tests, so the composition logic below is testable
// without touching disk or needing Windows/Steam installed.
export interface SteamFsDeps {
  readFile: (path: string) => Promise<string>
  readdir: (path: string) => Promise<string[]>
}

const realFs: SteamFsDeps = {
  readFile: (path) => readFile(path, 'utf-8'),
  readdir: (path) => readdir(path)
}

const APP_MANIFEST_PATTERN = /^appmanifest_\d+\.acf$/

async function readInstalledGamesFromLibrary(
  libraryPath: string,
  fs: SteamFsDeps
): Promise<InstalledGame[]> {
  const steamappsPath = join(libraryPath, 'steamapps')
  let entries: string[]
  try {
    entries = await fs.readdir(steamappsPath)
  } catch {
    // Library folder gone or unreadable (e.g. an unmounted drive) — skip it,
    // don't fail detection for every other library. Worth a warn (unlike a
    // missing libraryfolders.vdf, this is a library Steam itself listed).
    console.warn(`[steam] could not read library, skipping: ${steamappsPath}`)
    return []
  }

  const games: InstalledGame[] = []
  for (const entry of entries) {
    if (!APP_MANIFEST_PATTERN.test(entry)) continue

    let text: string
    try {
      text = await fs.readFile(join(steamappsPath, entry))
    } catch {
      // Also matched the manifest name pattern from a readdir listing that
      // just succeeded — a following read failure (permissions, a race) is
      // as unexpected as a parse failure below, so it gets the same warn.
      console.warn(`[steam] could not read manifest, skipping: ${join(steamappsPath, entry)}`)
      continue
    }

    const manifest = parseAppManifest(text)
    if (manifest === null) {
      // The file matched appmanifest_<id>.acf by name but didn't parse as
      // one — genuinely unexpected, unlike a file that's simply not there.
      console.warn(`[steam] could not parse manifest, skipping: ${join(steamappsPath, entry)}`)
      continue
    }

    games.push({
      storeGameId: manifest.appId,
      title: manifest.title,
      installPath: join(steamappsPath, 'common', manifest.installDir)
    })
  }
  return games
}

// Exported for tests: takes an already-resolved Steam path (or null) and an
// injectable fs, so it never has to shell out to `reg` or touch a real disk.
export async function getInstalledSteamGames(
  steamPath: string | null,
  fs: SteamFsDeps = realFs
): Promise<InstalledGame[]> {
  if (steamPath === null) return []

  let libraries: string[]
  try {
    const libraryFoldersText = await fs.readFile(join(steamPath, 'steamapps', 'libraryfolders.vdf'))
    libraries = parseLibraryFolders(libraryFoldersText)
  } catch {
    libraries = []
  }
  // A fresh Steam install has no libraryfolders.vdf entries yet — fall back
  // to the main install path itself.
  if (libraries.length === 0) libraries = [steamPath]

  const uniqueLibraries = Array.from(new Set(libraries))
  const gamesByLibrary = await Promise.all(
    uniqueLibraries.map((library) => readInstalledGamesFromLibrary(library, fs))
  )
  const games = gamesByLibrary.flat()

  // De-dupe by appId across libraries, in case a path is listed twice.
  const seenAppIds = new Set<string>()
  return games.filter((game) => {
    if (seenAppIds.has(game.storeGameId)) return false
    seenAppIds.add(game.storeGameId)
    return true
  })
}

export const steamProvider: StoreProvider = {
  store: 'steam',
  async getInstalledGames() {
    const steamPath = await getSteamInstallPath()
    return getInstalledSteamGames(steamPath)
  },
  getLaunchUrl(storeGameId) {
    return `steam://rungameid/${storeGameId}`
  }
}
