import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import { updateEpicCoverState, type EpicCoverStateDeps } from './epic-cover-state'

// Reads go through a no-op update: there is deliberately no read outside
// the write queue.
const readEpicCoverState = (deps: EpicCoverStateDeps): ReturnType<typeof updateEpicCoverState> =>
  updateEpicCoverState(() => undefined, deps)

function fsError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function fakeDeps(initial: string | null = null): EpicCoverStateDeps & { saved: () => unknown } {
  let content = initial
  return {
    saved: () => (content === null ? null : JSON.parse(content)),
    readFile: async () => {
      if (content === null) throw fsError('ENOENT')
      return content
    },
    writeFile: async (data) => {
      content = data
    }
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('readEpicCoverState', () => {
  it('reads nothing when there is no file yet', async () => {
    expect(await readEpicCoverState(fakeDeps())).toEqual({})
  })

  it.each([
    ['corrupt JSON', '{nope'],
    ['an unknown version', JSON.stringify({ version: 99, games: {} })],
    ['the wrong shape', JSON.stringify([1, 2])]
  ])('reads nothing from %s', async (_label, content) => {
    expect(await readEpicCoverState(fakeDeps(content))).toEqual({})
  })

  it('drops only the bad entries', async () => {
    const content = JSON.stringify({
      version: 1,
      games: {
        Sugar: { lastSeenInstalled: 5, noCoverCheckedAt: 6 },
        Broken: { lastSeenInstalled: 'yesterday' },
        '../evil': { lastSeenInstalled: 5 }
      }
    })
    expect(await readEpicCoverState(fakeDeps(content))).toEqual({
      Sugar: { lastSeenInstalled: 5, noCoverCheckedAt: 6 }
    })
  })

  it('never lets an entry called "__proto__" change any prototype', async () => {
    const content = '{"version":1,"games":{"__proto__":{"lastSeenInstalled":5,"polluted":true}}}'
    const games = await readEpicCoverState(fakeDeps(content))
    expect(Object.getPrototypeOf(games)).toBeNull()
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('keeps a "__proto__" entry added by an update as a plain entry', async () => {
    const games = await updateEpicCoverState((g) => {
      g['__proto__'] = { lastSeenInstalled: 1 }
    }, fakeDeps())
    expect(Object.keys(games)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(games)).toBeNull()
  })
})

describe('updateEpicCoverState: unreadable file', () => {
  it('throws and saves nothing when the file exists but cannot be read', async () => {
    const good = JSON.stringify({ version: 1, games: { Sugar: { lastSeenInstalled: 5 } } })
    const deps = fakeDeps(good)
    const locked = { ...deps, readFile: async () => Promise.reject(fsError('EBUSY')) }
    const mutate = vi.fn()

    await expect(updateEpicCoverState(mutate, locked)).rejects.toThrow('EBUSY')

    expect(mutate).not.toHaveBeenCalled()
    expect(deps.saved()).toEqual(JSON.parse(good))
  })
})

describe('updateEpicCoverState', () => {
  it('saves the change and returns the new state', async () => {
    const deps = fakeDeps()

    const games = await updateEpicCoverState((g) => {
      g['Sugar'] = { lastSeenInstalled: 10 }
    }, deps)

    expect(games).toEqual({ Sugar: { lastSeenInstalled: 10 } })
    expect(deps.saved()).toEqual({ version: 1, games: { Sugar: { lastSeenInstalled: 10 } } })
  })

  it('runs concurrent updates one after another so neither is lost', async () => {
    const deps = fakeDeps()

    await Promise.all([
      updateEpicCoverState((g) => {
        g['A'] = { lastSeenInstalled: 1 }
      }, deps),
      updateEpicCoverState((g) => {
        g['B'] = { lastSeenInstalled: 2 }
      }, deps)
    ])

    expect(await readEpicCoverState(deps)).toEqual({
      A: { lastSeenInstalled: 1 },
      B: { lastSeenInstalled: 2 }
    })
  })

  it('throws when saving fails, and later updates still run', async () => {
    const deps = fakeDeps()
    const failing = { ...deps, writeFile: async () => Promise.reject(new Error('disk full')) }

    await expect(updateEpicCoverState(() => undefined, failing)).rejects.toThrow('disk full')
    await expect(
      updateEpicCoverState((g) => {
        g['A'] = { lastSeenInstalled: 1 }
      }, deps)
    ).resolves.toEqual({ A: { lastSeenInstalled: 1 } })
  })
})
