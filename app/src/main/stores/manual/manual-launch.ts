import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import type { DirectLaunchResult } from '../store-provider'
import { isExeFile, realExePathDeps, type ExePathDeps } from './exe-path'

// Starting a manual game's .exe (docs/features/library-tools.md, "Launching").

// The bits of a ChildProcess this needs, so tests can fake it.
export interface LaunchedProcess {
  once(event: 'spawn', listener: () => void): unknown
  once(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  unref(): void
}

export interface SpawnOptions {
  cwd: string
  detached: boolean
  stdio: 'ignore'
  windowsHide: boolean
  windowsVerbatimArguments: boolean
  argv0: string
}

export interface LaunchDeps extends ExePathDeps {
  spawn: (file: string, args: string[], options: SpawnOptions) => LaunchedProcess
}

export const realLaunchDeps: LaunchDeps = {
  ...realExePathDeps,
  spawn: (file, args, options) => spawn(file, args, options)
}

// What Windows' refusals look like from Node. Starting an exe that needs
// administrator rights without the admin prompt fails with
// ERROR_ELEVATION_REQUIRED, which Node reports as EACCES (expected; not yet
// seen on a real PC).
const REFUSED_CODES = new Set(['EACCES', 'EPERM'])

export async function launchExe(
  exePath: string,
  args: string,
  deps: LaunchDeps = realLaunchDeps
): Promise<DirectLaunchResult> {
  if (!(await isExeFile(exePath, deps))) return { accepted: false, reason: 'missing' }

  return new Promise((resolve) => {
    let child: LaunchedProcess
    try {
      child = deps.spawn(exePath, args === '' ? [] : [args], {
        // Many games load their files relative to the working folder.
        cwd: dirname(exePath),
        // Its own process group, so closing the app doesn't close the game.
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        // The arguments go to Windows exactly as typed: Windows programs
        // split their own command line, so splitting and re-quoting here
        // would change what the game sees. With verbatim arguments Node
        // doesn't quote the program name either, so it's quoted here (a path
        // with spaces would otherwise reach the game as several words).
        windowsVerbatimArguments: true,
        argv0: `"${exePath}"`
      })
    } catch (err) {
      console.warn('[manual] could not start a game:', err)
      resolve({ accepted: false, reason: 'failed' })
      return
    }
    // A later error (none is expected once it has started) must not become
    // an uncaught exception in main.
    child.on('error', () => undefined)
    child.once('spawn', () => {
      child.unref()
      resolve({ accepted: true })
    })
    child.once('error', (err) => {
      console.warn('[manual] a game failed to start:', err.code ?? err.message)
      if (err.code === 'ENOENT') resolve({ accepted: false, reason: 'missing' })
      else if (err.code !== undefined && REFUSED_CODES.has(err.code)) {
        resolve({ accepted: false, reason: 'refused' })
      } else resolve({ accepted: false, reason: 'failed' })
    })
  })
}
