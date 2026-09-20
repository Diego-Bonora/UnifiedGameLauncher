import { parseVdf } from './vdf'

export interface SteamAppManifest {
  appId: string
  title: string
  installDir: string
}

// Parses one steamapps/appmanifest_<id>.acf file. Returns null for anything
// that doesn't look like a real manifest (missing fields, wrong shape)
// rather than throwing — one corrupt file should never take down detection
// for every other installed game.
export function parseAppManifest(text: string): SteamAppManifest | null {
  const root = parseVdf(text)
  const appState = root['AppState']
  if (typeof appState !== 'object') return null

  const appId = appState['appid']
  const title = appState['name']
  const installDir = appState['installdir']
  if (typeof appId !== 'string' || appId.length === 0) return null
  if (typeof title !== 'string' || title.length === 0) return null
  if (typeof installDir !== 'string' || installDir.length === 0) return null

  return { appId, title, installDir }
}
