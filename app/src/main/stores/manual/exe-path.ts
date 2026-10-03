import { realpath } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

// Path rules for manual games' .exe files.

export interface ExePathDeps {
  stat: (path: string) => Promise<{ isFile: () => boolean }>
  realpath: (path: string) => Promise<string>
}

export const realExePathDeps: ExePathDeps = {
  stat: (path) => stat(path),
  // The native version asks Windows for the file's final path, which also
  // expands 8.3 short names (C:\PROGRA~1\...).
  // (Only the callback form has a native version.)
  realpath: (path) =>
    new Promise((resolve, reject) => {
      realpath.native(path, (err, resolved) => (err ? reject(err) : resolve(resolved)))
    })
}

// Only real .exe files: no shortcuts (.lnk, .url), scripts (.bat, .cmd) or
// documents, which Windows would open with some other program.
export function hasExeExtension(path: string): boolean {
  return /\.exe$/i.test(path)
}

export async function isExeFile(
  path: string,
  deps: ExePathDeps = realExePathDeps
): Promise<boolean> {
  if (!hasExeExtension(path)) return false
  try {
    return (await deps.stat(path)).isFile()
  } catch {
    return false
  }
}

// The real path of a file the user just picked: Windows' own final path,
// which also resolves short names (C:\PROGRA~1\...) and links. Saved as the
// game's path, so later duplicate checks compare saved paths by spelling and
// never touch a saved game's drive (an unplugged drive or offline share can
// make Windows wait a long time, and the check runs inside the save queue).
// Falls back to the picked spelling if it can't be resolved.
export async function resolveExePath(
  path: string,
  deps: ExePathDeps = realExePathDeps
): Promise<string> {
  try {
    return await deps.realpath(path)
  } catch {
    return path
  }
}

// Whether two resolved paths name the same file: Windows paths ignore case
// and accept either slash.
export function isSamePath(a: string, b: string): boolean {
  const spelling = (path: string): string => path.replace(/\//g, '\\').toLowerCase()
  return spelling(a) === spelling(b)
}

// The add form's starting title: the file name without ".exe".
export function suggestedTitle(path: string): string {
  // Either slash: the dev app runs on macOS/Linux too, with Windows-style
  // test paths.
  const name = basename(path.replace(/\\/g, '/'))
  return name.replace(/\.exe$/i, '') || name
}

export function exeFileName(path: string): string {
  return basename(path.replace(/\\/g, '/'))
}
