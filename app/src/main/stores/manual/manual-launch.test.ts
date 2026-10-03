import { EventEmitter } from 'node:events'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  launchExe,
  type LaunchDeps,
  type LaunchedProcess,
  type SpawnOptions
} from './manual-launch'

// Built with this platform's separator: the app only ever sees real paths.
const EXE = resolve(join('Games', 'My Game', 'game.exe'))

// A spawned process that starts, or fails with `errorCode`, on the next tick.
function fakeLaunch(
  errorCode?: string,
  exists = true
): LaunchDeps & {
  calls: { file: string; args: string[]; options: SpawnOptions }[]
  unref: ReturnType<typeof vi.fn>
} {
  const calls: { file: string; args: string[]; options: SpawnOptions }[] = []
  const unref = vi.fn()
  return {
    calls,
    unref,
    stat: async () => {
      if (!exists) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return { isFile: () => true }
    },
    realpath: async (path) => path,
    spawn: (file, args, options) => {
      calls.push({ file, args, options })
      const child = Object.assign(new EventEmitter(), { unref }) as unknown as LaunchedProcess &
        EventEmitter
      setTimeout(() => {
        if (errorCode === undefined) child.emit('spawn')
        else child.emit('error', Object.assign(new Error(errorCode), { code: errorCode }))
      }, 0)
      return child
    }
  }
}

describe('launchExe', () => {
  it('starts the saved exe from its folder, detached, with the arguments as typed', async () => {
    const deps = fakeLaunch()
    expect(await launchExe(EXE, '-config="C:\\My Games\\a.ini" -windowed', deps)).toEqual({
      accepted: true
    })
    const call = deps.calls[0]
    expect(call?.file).toBe(EXE)
    expect(call?.args).toEqual(['-config="C:\\My Games\\a.ini" -windowed'])
    expect(call?.options).toMatchObject({
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
      // Quoted, because verbatim arguments aren't quoted by Node.
      argv0: `"${EXE}"`
    })
    expect(call?.options.cwd).toBe(resolve(join('Games', 'My Game')))
    expect(deps.unref).toHaveBeenCalled()
  })

  it('passes no arguments at all when there are none', async () => {
    const deps = fakeLaunch()
    await launchExe(EXE, '', deps)
    expect(deps.calls[0]?.args).toEqual([])
  })

  it('reports a missing exe without trying to start it', async () => {
    const deps = fakeLaunch(undefined, false)
    expect(await launchExe(EXE, '', deps)).toEqual({ accepted: false, reason: 'missing' })
    expect(deps.calls).toEqual([])
  })

  it('never starts something that is not an .exe', async () => {
    const deps = fakeLaunch()
    expect(await launchExe('C:\\Games\\run.bat', '', deps)).toEqual({
      accepted: false,
      reason: 'missing'
    })
    expect(deps.calls).toEqual([])
  })

  it.each([
    ['EACCES', 'refused'],
    ['EPERM', 'refused'],
    ['ENOENT', 'missing'],
    ['UNKNOWN', 'failed']
  ])('turns a %s start failure into %s', async (code, reason) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await launchExe(EXE, '', fakeLaunch(code))).toEqual({ accepted: false, reason })
    warn.mockRestore()
  })

  it('reports a spawn that throws as failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const deps: LaunchDeps = {
      ...fakeLaunch(),
      spawn: () => {
        throw new Error('bad argument')
      }
    }
    expect(await launchExe(EXE, '', deps)).toEqual({ accepted: false, reason: 'failed' })
    warn.mockRestore()
  })
})
