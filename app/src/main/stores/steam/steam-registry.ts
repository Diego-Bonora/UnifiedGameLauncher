import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Reads HKCU\Software\Valve\Steam\SteamPath via the built-in `reg` tool
// rather than a native registry npm module, to keep the build free of
// node-gyp/native-module concerns. Static args only, no shell interpolation.
export async function getSteamInstallPath(): Promise<string | null> {
  if (process.platform !== 'win32') return null

  try {
    const { stdout } = await execFileAsync('reg', [
      'query',
      'HKCU\\Software\\Valve\\Steam',
      '/v',
      'SteamPath'
    ])
    const match = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)
    const path = match?.[1]?.trim()
    return path !== undefined && path.length > 0 ? path : null
  } catch {
    // Steam isn't installed, or the key is missing — not an error, just an
    // empty library. Never surface this as a raw error to the user.
    return null
  }
}
