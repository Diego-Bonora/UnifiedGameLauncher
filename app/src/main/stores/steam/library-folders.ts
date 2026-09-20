import { parseVdf } from './vdf'

// Parses steamapps/libraryfolders.vdf into the list of library root
// folders (each has its own steamapps/ with appmanifest_*.acf files inside).
// Modern Steam lists the main install itself as one of these entries, so
// callers don't need to add it separately — but should still fall back to
// the Steam install path if this file is missing or empty (a fresh install
// has no libraries listed yet).
// Only handles the current nested "0" { "path" ... } format. Pre-2021
// Steam wrote a flat "1" "D:\SteamLibrary" format instead; those entries
// are silently skipped here (Steam auto-migrates old configs on update, so
// this is a low-risk gap, not full backward compatibility).
export function parseLibraryFolders(text: string): string[] {
  const root = parseVdf(text)
  const libraryFolders = root['libraryfolders']
  if (typeof libraryFolders !== 'object') return []

  const paths: string[] = []
  for (const entry of Object.values(libraryFolders)) {
    if (typeof entry !== 'object') continue
    const path = entry['path']
    if (typeof path === 'string' && path.length > 0) paths.push(path)
  }
  return paths
}
