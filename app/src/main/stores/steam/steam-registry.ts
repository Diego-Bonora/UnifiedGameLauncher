import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Runs `reg` with fixed arguments and returns its stdout. Injectable so the
// exit-code handling below can be tested without Windows.
export type RegQuery = (args: string[]) => Promise<string>

const realRegQuery: RegQuery = async (args) => (await execFileAsync('reg', args)).stdout

// Reads HKCU\Software\Valve\Steam\SteamPath via the built-in `reg` tool
// rather than a native registry npm module, to keep the build free of
// node-gyp/native-module concerns. Static args only, no shell interpolation.
// null when Steam isn't installed; throws when the registry couldn't be read.
export async function getSteamInstallPath(
  query: RegQuery = realRegQuery,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  if (platform !== 'win32') return null

  let stdout: string
  try {
    stdout = await query(['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'])
  } catch (err) {
    // `reg` exits with 1 when the key or value doesn't exist: Steam isn't
    // installed, which is an empty library, not an error. Anything else (reg
    // itself blocked or failing) means we couldn't look, and must not be
    // mistaken for "no Steam": the caller would show every installed game as
    // uninstalled. The caller turns the throw into data for the renderer.
    if ((err as { code?: unknown } | null)?.code === 1) return null
    throw err
  }
  const match = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)
  const path = match?.[1]?.trim()
  return path !== undefined && path.length > 0 ? path : null
}
