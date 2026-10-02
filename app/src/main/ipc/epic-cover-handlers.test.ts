import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EpicCoverProblem } from '@shared/ipc/epic'
import { createEpicCoverHandlers, type EpicCoverHandlerDeps } from './epic-cover-handlers'

const KEY = '0123456789abcdef0123456789abcdef'

interface Fake extends EpicCoverHandlerDeps {
  key: string | null
  problem: EpicCoverProblem | null
  paused: boolean
  installed: string[]
  sync: ReturnType<typeof vi.fn<EpicCoverHandlerDeps['sync']>>
  reset: ReturnType<typeof vi.fn<EpicCoverHandlerDeps['reset']>>
  notify: ReturnType<typeof vi.fn<EpicCoverHandlerDeps['notify']>>
}

// A key is saved unless a test says otherwise.
function fakeDeps(): Fake {
  const fake: Fake = {
    key: KEY,
    problem: null,
    paused: false,
    installed: ['Sugar'],
    getKey: async () => fake.key,
    saveKey: async (apiKey) => {
      fake.key = apiKey
    },
    removeKey: async () => {
      fake.key = null
    },
    detect: async () => fake.installed,
    sync: vi.fn<EpicCoverHandlerDeps['sync']>(async () => 0),
    reset: vi.fn<EpicCoverHandlerDeps['reset']>(async () => {
      fake.problem = null
    }),
    getProblem: () => fake.problem,
    isBackoffActive: () => fake.paused,
    localUrls: async () => new Map(),
    notify: vi.fn<EpicCoverHandlerDeps['notify']>()
  }
  return fake
}

// Lets the handlers' background (not awaited) work finish.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('listCovers.onListed: when to sync', () => {
  it('syncs the first list read, with the saved key', async () => {
    const deps = fakeDeps()

    createEpicCoverHandlers(deps).listCovers.onListed(['Sugar', 'Fortnite'])
    await settle()

    expect(deps.sync).toHaveBeenCalledWith(['Sugar', 'Fortnite'], KEY)
  })

  it('does not sync again for the same games after a good sync (every window focus)', async () => {
    const deps = fakeDeps()
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A', 'B'])
    await settle()
    handlers.listCovers.onListed(['B', 'A'])
    await settle()

    expect(deps.sync).toHaveBeenCalledTimes(1)
  })

  it('syncs again when a game is installed or removed', async () => {
    const deps = fakeDeps()
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    handlers.listCovers.onListed(['A', 'B'])
    await settle()

    expect(deps.sync).toHaveBeenCalledTimes(2)
  })

  it('retries on the next list read after a sync that ended unavailable', async () => {
    const deps = fakeDeps()
    deps.sync.mockImplementationOnce(async () => {
      deps.problem = 'unavailable'
      return 0
    })
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    deps.problem = null
    handlers.listCovers.onListed(['A'])
    await settle()
    handlers.listCovers.onListed(['A'])
    await settle()

    // The failed startup sync, one retry that succeeded, then quiet again.
    expect(deps.sync).toHaveBeenCalledTimes(2)
  })

  it('without a key, does only the housekeeping, once per list, and syncs once the key can be read', async () => {
    const deps = fakeDeps()
    deps.key = null // no key, or secrets.json locked at startup
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    handlers.listCovers.onListed(['A'])
    await settle()
    expect(deps.sync.mock.calls).toEqual([[['A'], null]])

    deps.key = KEY
    handlers.listCovers.onListed(['A'])
    await settle()
    expect(deps.sync).toHaveBeenLastCalledWith(['A'], KEY)
  })

  it('waits out the backoff before retrying a failed sync', async () => {
    const deps = fakeDeps()
    deps.sync.mockImplementationOnce(async () => {
      deps.problem = 'unavailable'
      deps.paused = true
      return 0
    })
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    handlers.listCovers.onListed(['A'])
    await settle()
    expect(deps.sync).toHaveBeenCalledTimes(1)

    deps.paused = false
    handlers.listCovers.onListed(['A'])
    await settle()
    expect(deps.sync).toHaveBeenCalledTimes(2)
  })

  it('ignores an empty list', async () => {
    const deps = fakeDeps()
    createEpicCoverHandlers(deps).listCovers.onListed([])
    await settle()
    expect(deps.sync).not.toHaveBeenCalled()
  })
})

describe('listCovers.onListed: telling the window', () => {
  it('notifies when new covers were saved', async () => {
    const deps = fakeDeps()
    deps.sync.mockResolvedValue(2)

    createEpicCoverHandlers(deps).listCovers.onListed(['A'])
    await settle()

    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it('notifies when the status changed, and only then', async () => {
    const deps = fakeDeps()
    deps.sync.mockImplementation(async () => {
      deps.problem = 'keyRejected'
      return 0
    })
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    handlers.listCovers.onListed(['A', 'B'])
    await settle()

    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it('does not notify when nothing changed', async () => {
    const deps = fakeDeps()
    createEpicCoverHandlers(deps).listCovers.onListed(['A'])
    await settle()
    expect(deps.notify).not.toHaveBeenCalled()
  })
})

describe('setKey', () => {
  it('saves a valid key, trimmed, and fetches covers for what is installed', async () => {
    const deps = fakeDeps()
    deps.key = null
    const handlers = createEpicCoverHandlers(deps)

    const result = await handlers.setKey({ apiKey: `  ${KEY}\n` })
    await settle()

    expect(result).toEqual({ saved: true, status: { hasKey: true, problem: null } })
    expect(deps.key).toBe(KEY)
    expect(deps.reset).toHaveBeenCalledTimes(1)
    expect(deps.sync).toHaveBeenCalledWith(['Sugar'], KEY)
  })

  it('starts one sync, not two, when the window re-reads the list during the save', async () => {
    const deps = fakeDeps()
    let finishReset: () => void = () => undefined
    deps.reset.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishReset = resolve
        })
    )
    const handlers = createEpicCoverHandlers(deps)

    await handlers.setKey({ apiKey: KEY })
    handlers.listCovers.onListed(['Sugar'])
    finishReset()
    await settle()

    expect(deps.sync).toHaveBeenCalledTimes(1)
  })

  it('does not start a sync before the key-change reset has finished', async () => {
    const deps = fakeDeps()
    let finishReset: () => void = () => undefined
    deps.reset.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishReset = resolve
        })
    )
    const handlers = createEpicCoverHandlers(deps)

    await handlers.setKey({ apiKey: KEY })
    handlers.listCovers.onListed(['Other'])
    await settle()
    expect(deps.sync).not.toHaveBeenCalled()

    finishReset()
    await settle()
    expect(deps.sync).toHaveBeenCalled()
  })

  it.each([
    ['too short', { apiKey: 'abc' }],
    ['not hex', { apiKey: 'z'.repeat(32) }],
    ['missing', {}],
    ['not an object', 'key']
  ])('returns invalidKey, without saving, for a key that is %s', async (_label, request) => {
    const deps = fakeDeps()
    deps.key = null

    const result = await createEpicCoverHandlers(deps).setKey(request)

    expect(result).toEqual({ saved: false, reason: 'invalidKey' })
    expect(deps.key).toBeNull()
    expect(deps.reset).not.toHaveBeenCalled()
  })

  it('returns cannotStore as data when the key cannot be saved', async () => {
    const deps = fakeDeps()
    deps.saveKey = async () => Promise.reject(new Error('safeStorage unavailable'))

    const result = await createEpicCoverHandlers(deps).setKey({ apiKey: KEY })

    expect(result).toEqual({ saved: false, reason: 'cannotStore' })
    expect(deps.reset).not.toHaveBeenCalled()
  })

  it('stops a sync that read the old key just before the change', async () => {
    const deps = fakeDeps()
    const oldKey = 'f'.repeat(32)
    let releaseKey: (key: string | null) => void = () => undefined
    const realGetKey = deps.getKey
    deps.getKey = () =>
      new Promise((resolve) => {
        releaseKey = resolve
      })
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    deps.getKey = realGetKey
    await handlers.setKey({ apiKey: KEY })
    releaseKey(oldKey)
    await settle()

    expect(deps.sync.mock.calls.map(([, key]) => key)).toEqual([KEY])
  })
})

describe('a sync cut off by a key change', () => {
  it('still announces covers it saved before the change', async () => {
    const deps = fakeDeps()
    let finishSync: (saved: number) => void = () => undefined
    deps.sync.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishSync = resolve
        })
    )
    const handlers = createEpicCoverHandlers(deps)

    handlers.listCovers.onListed(['A'])
    await settle()
    await handlers.clearKey()
    finishSync(1)
    await settle()

    expect(deps.notify).toHaveBeenCalledTimes(1)
  })
})

describe('clearKey', () => {
  it('removes the key, stops lookups and reports no key', async () => {
    const deps = fakeDeps()
    deps.problem = 'keyRejected'

    const result = await createEpicCoverHandlers(deps).clearKey()

    expect(result).toEqual({ cleared: true, status: { hasKey: false, problem: null } })
    expect(deps.reset).toHaveBeenCalledTimes(1)
  })

  it('changes nothing when removing fails: same status, no reset, no new lookups', async () => {
    const deps = fakeDeps()
    deps.problem = 'keyRejected'
    deps.removeKey = async () => Promise.reject(new Error('locked'))
    const handlers = createEpicCoverHandlers(deps)
    handlers.listCovers.onListed(['A'])
    await settle()

    const result = await handlers.clearKey()
    handlers.listCovers.onListed(['A'])
    await settle()

    expect(result).toEqual({ cleared: false, status: { hasKey: true, problem: 'keyRejected' } })
    expect(deps.reset).not.toHaveBeenCalled()
    expect(deps.sync).toHaveBeenCalledTimes(1)
  })
})

describe('getStatus', () => {
  it('reports the problem only while a key is saved', async () => {
    const deps = fakeDeps()
    deps.key = null
    deps.problem = 'unavailable'
    const handlers = createEpicCoverHandlers(deps)

    expect(await handlers.getStatus()).toEqual({ hasKey: false, problem: null })
    deps.key = KEY
    expect(await handlers.getStatus()).toEqual({ hasKey: true, problem: 'unavailable' })
  })
})
