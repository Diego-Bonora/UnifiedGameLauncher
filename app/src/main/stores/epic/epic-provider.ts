import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEpicManifest } from './epic-manifest'
import type { InstalledGame, StoreProvider } from '../store-provider'

// Same injectable-fs pattern as the Steam provider, so detection is testable
// without Windows or the Epic launcher installed.
export interface EpicFsDeps {
  readFile: (path: string) => Promise<string>
  readdir: (path: string) => Promise<string[]>
}

const realFs: EpicFsDeps = {
  readFile: (path) => readFile(path, 'utf-8'),
  readdir: (path) => readdir(path)
}

// Epic keeps its manifests under ProgramData, not the user profile.
export function getEpicManifestsDir(): string {
  const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData'
  return join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
}

export async function getInstalledEpicGames(
  manifestsDir: string,
  fs: EpicFsDeps = realFs
): Promise<InstalledGame[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(manifestsDir)
  } catch {
    // No folder just means Epic isn't installed (or nothing is installed
    // through it): not an error, so no warning either.
    return []
  }

  const games: InstalledGame[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.item')) continue

    let text: string
    try {
      text = await fs.readFile(join(manifestsDir, entry))
    } catch {
      console.warn(`[epic] could not read manifest, skipping: ${join(manifestsDir, entry)}`)
      continue
    }

    const result = parseEpicManifest(text)
    if (result.kind === 'invalid') {
      console.warn(`[epic] could not parse manifest, skipping: ${join(manifestsDir, entry)}`)
      continue
    }
    // DLC, non-games and half-finished installs are normal, so not logged.
    if (result.kind === 'skipped') continue
    const { manifest } = result
    if (seen.has(manifest.appName)) continue
    seen.add(manifest.appName)

    games.push({
      storeGameId: manifest.appName,
      title: manifest.title,
      installPath: manifest.installLocation,
      catalogNamespace: manifest.catalogNamespace,
      catalogItemId: manifest.catalogItemId
    })
  }
  return games
}

export const epicProvider: StoreProvider = {
  store: 'epic',
  getInstalledGames() {
    return getInstalledEpicGames(getEpicManifestsDir())
  },
  getLaunchUrl(storeGameId) {
    // silent=true starts the game without bringing the launcher to the front.
    return `com.epicgames.launcher://apps/${encodeURIComponent(storeGameId)}?action=launch&silent=true`
  }
}
