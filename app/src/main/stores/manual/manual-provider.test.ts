import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createManualGamesFile } from './manual-games-file'
import { createManualProvider } from './manual-provider'
import type { LaunchDeps, LaunchedProcess } from './manual-launch'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('manual provider', () => {
  it('never reads an unreadable file as "no games"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const file = createManualGamesFile({
      readFile: async () => Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })),
      writeFile: async () => undefined
    })
    const provider = createManualProvider(file)
    await expect(provider.getInstalledGames()).rejects.toThrow()
    expect(await provider.launch(ID)).toEqual({ accepted: false, reason: 'unreadable' })
    warn.mockRestore()
  })

  it('launches a saved game by id, and reports an unknown id', async () => {
    const started: string[] = []
    const launchDeps: LaunchDeps = {
      stat: async () => ({ isFile: () => true }),
      realpath: async (path) => path,
      spawn: (file) => {
        started.push(file)
        const child = Object.assign(new EventEmitter(), { unref: () => undefined })
        setTimeout(() => child.emit('spawn'), 0)
        return child as unknown as LaunchedProcess
      }
    }
    const file = createManualGamesFile({
      readFile: async () =>
        JSON.stringify({
          games: [
            { id: ID, title: 'Doom', exePath: 'C:\\Doom\\doom.exe', args: '', coverSource: 'icon' }
          ]
        }),
      writeFile: async () => undefined
    })
    const provider = createManualProvider(file, launchDeps)
    expect(await provider.launch(ID)).toEqual({ accepted: true })
    expect(started).toEqual(['C:\\Doom\\doom.exe'])
    expect(await provider.launch('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toEqual({
      accepted: false,
      reason: 'notFound'
    })
  })
})
