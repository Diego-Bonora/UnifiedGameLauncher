import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAppManifest } from './app-manifest'
import { parseLibraryFolders } from './library-folders'
import { getSteamInstallPath } from './steam-registry'
import type { InstalledGame, UrlStoreProvider } from '../store-provider'

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

// What one look at a library folder found. `readable: false` means the folder
// Steam lists couldn't be read this time (a sleeping or unplugged drive, a
// permissions problem), which is not the same as "no games there": the games
// last seen in it are probably still installed.
export interface SteamLibraryScan {
  path: string
  readable: boolean
  games: InstalledGame[]
}

// `libraryListReadable: false` means libraryfolders.vdf exists but couldn't be
// read, so only the main Steam folder was scanned and other libraries may be
// missing from `libraries` altogether.
export interface SteamInstallScan {
  libraries: SteamLibraryScan[]
  libraryListReadable: boolean
}

async function scanLibrary(libraryPath: string, fs: SteamFsDeps): Promise<SteamLibraryScan> {
  const steamappsPath = join(libraryPath, 'steamapps')
  let entries: string[]
  try {
    entries = await fs.readdir(steamappsPath)
  } catch {
    // Reported, not just skipped: the caller must not read this as "these
    // games were uninstalled". Worth a warn too (unlike a missing
    // libraryfolders.vdf, this is a library Steam itself listed).
    console.warn(`[steam] could not read library, skipping: ${steamappsPath}`)
    return { path: libraryPath, readable: false, games: [] }
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
      // One game is skipped rather than the folder marked unreadable, so a
      // single broken file can't stop the list from ever updating.
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
  return { path: libraryPath, readable: true, games }
}

function isMissingFile(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

// Exported for tests: takes an already-resolved Steam path (or null) and an
// injectable fs, so it never has to shell out to `reg` or touch a real disk.
// A null path means Steam isn't installed: an empty scan, not a failure.
export async function scanInstalledSteamGames(
  steamPath: string | null,
  fs: SteamFsDeps = realFs
): Promise<SteamInstallScan> {
  if (steamPath === null) return { libraries: [], libraryListReadable: true }

  let libraries: string[]
  let libraryListReadable = true
  let libraryListMissing = false
  try {
    const libraryFoldersText = await fs.readFile(join(steamPath, 'steamapps', 'libraryfolders.vdf'))
    libraries = parseLibraryFolders(libraryFoldersText)
  } catch (err) {
    // A fresh Steam install has no libraryfolders.vdf yet; that's normal.
    // Any other failure hides which libraries exist.
    if (isMissingFile(err)) {
      libraryListMissing = true
    } else {
      console.warn('[steam] could not read libraryfolders.vdf:', err)
      libraryListReadable = false
    }
    libraries = []
  }
  // No libraryfolders.vdf entries yet: fall back to the main install path.
  if (libraries.length === 0) libraries = [steamPath]

  const uniqueLibraries = Array.from(new Set(libraries))
  const scans = await Promise.all(uniqueLibraries.map((library) => scanLibrary(library, fs)))

  // De-dupe by appId across libraries, in case a path is listed twice or a
  // game was moved and left a stale manifest: the first library listed wins.
  const seenAppIds = new Set<string>()
  const libraryScans = scans.map((scan) => ({
    ...scan,
    games: scan.games.filter((game) => {
      if (seenAppIds.has(game.storeGameId)) return false
      seenAppIds.add(game.storeGameId)
      return true
    })
  }))
  // "Missing" also comes back when the whole drive Steam is on is gone (an
  // unplugged USB drive): Windows reports a path on a missing drive as not
  // found. It only means a fresh install if the Steam folder itself could be
  // read; otherwise other libraries may exist that we can't name.
  if (libraryListMissing && libraryScans.some((library) => !library.readable)) {
    libraryListReadable = false
  }
  return { libraries: libraryScans, libraryListReadable }
}

export async function scanSteamInstall(): Promise<SteamInstallScan> {
  return scanInstalledSteamGames(await getSteamInstallPath())
}

export const steamProvider: UrlStoreProvider = {
  store: 'steam',
  launchesBy: 'url',
  // Lossy: an unreadable library just contributes no games here, which reads
  // as "uninstalled". Anything that shows or saves installed state must use
  // scanSteamInstall instead, which says what couldn't be read.
  async getInstalledGames() {
    const scan = await scanSteamInstall()
    return scan.libraries.flatMap((library) => library.games)
  },
  // encodeURIComponent although main only passes ids validated as digits:
  // the URL builder shouldn't rely on every caller having checked.
  getLaunchUrl(storeGameId) {
    return `steam://rungameid/${encodeURIComponent(storeGameId)}`
  },
  getInstallUrl(storeGameId) {
    return `steam://install/${encodeURIComponent(storeGameId)}`
  }
}
