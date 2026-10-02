import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' } }))

import {
  getEpicCoverProblem,
  getLocalEpicCoverUrls,
  resetEpicCoverLookups,
  syncEpicCovers,
  type EpicCoverCacheDeps
} from './epic-cover-cache'
import type { EpicCoverGames } from './epic-cover-state'
import type { GridLookup } from './steamgriddb'

const DAY = 24 * 60 * 60 * 1000
const KEY = 'a'.repeat(32)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
// An animated PNG: an acTL chunk before any image data.
const APNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c
])
const coverUrl = (id: string): string => `https://cdn2.steamgriddb.com/grid/${id}abc.png`

interface FakeDeps extends EpicCoverCacheDeps {
  files: Set<string>
  state: EpicCoverGames
  deleted: string[]
  lookup: ReturnType<typeof vi.fn<EpicCoverCacheDeps['lookup']>>
  fetchImage: ReturnType<typeof vi.fn<EpicCoverCacheDeps['fetchImage']>>
  clock: { now: number }
}

// The folder and the state file are in memory; every lookup finds a poster
// unless a test says otherwise.
function fakeDeps(existingFiles: string[] = [], state: EpicCoverGames = {}): FakeDeps {
  const deps: FakeDeps = {
    files: new Set(existingFiles),
    state: structuredClone(state),
    deleted: [],
    clock: { now: 100 * DAY },
    lookup: vi.fn<EpicCoverCacheDeps['lookup']>(async (id) => ({
      kind: 'found',
      url: coverUrl(id)
    })),
    fetchImage: vi.fn<EpicCoverCacheDeps['fetchImage']>(async () => PNG),
    listFiles: async () => [...deps.files],
    writeFile: async (name) => {
      deps.files.add(name)
    },
    deleteFile: async (name) => {
      deps.files.delete(name)
      deps.deleted.push(name)
    },
    updateState: async (mutate) => {
      const copy = structuredClone(deps.state)
      mutate(copy)
      deps.state = copy
      return structuredClone(copy)
    },
    now: () => deps.clock.now
  }
  return deps
}

function lookupReturns(deps: FakeDeps, result: GridLookup): void {
  deps.lookup.mockResolvedValue(result)
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  // Module state (rejected key, backoff, problem) lives for the session;
  // start every test from a clean one.
  await resetEpicCoverLookups(fakeDeps())
})

describe('syncEpicCovers: downloading', () => {
  it('fetches a poster for each installed game and names the file by AppName', async () => {
    const deps = fakeDeps()

    const saved = await syncEpicCovers(['Sugar', 'Fortnite'], KEY, deps)

    expect(saved).toBe(2)
    expect([...deps.files].sort()).toEqual(['Fortnite.png', 'Sugar.png'])
    expect(deps.lookup).toHaveBeenCalledWith('Sugar', KEY, expect.any(AbortSignal))
  })

  it('skips games whose cover is already saved', async () => {
    const deps = fakeDeps(['Sugar.png'])

    await syncEpicCovers(['Sugar'], KEY, deps)

    expect(deps.lookup).not.toHaveBeenCalled()
  })

  it('looks nothing up without a key', async () => {
    const deps = fakeDeps()

    await syncEpicCovers(['Sugar'], null, deps)

    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.state['Sugar']?.lastSeenInstalled).toBe(deps.clock.now)
  })

  it('ignores ids that are not valid AppNames', async () => {
    const deps = fakeDeps()

    await syncEpicCovers(['../evil', 'Sugar'], KEY, deps)

    expect(deps.lookup).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an animated image', APNG],
    ['a page that is not an image', new TextEncoder().encode('<html>')],
    ['an empty body', new Uint8Array(0)]
  ])('does not save %s and asks again next time', async (_label, bytes) => {
    const deps = fakeDeps()
    deps.fetchImage.mockResolvedValue(bytes)

    expect(await syncEpicCovers(['Sugar'], KEY, deps)).toBe(0)
    expect(deps.files.size).toBe(0)
    expect(deps.state['Sugar']?.noCoverCheckedAt).toBeUndefined()
  })

  it('never downloads from a URL outside the SteamGridDB image host', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'found', url: 'https://evil.example/grid/a.png' })

    await syncEpicCovers(['Sugar'], KEY, deps)

    expect(deps.fetchImage).not.toHaveBeenCalled()
  })

  it('keeps going after one download fails', async () => {
    const deps = fakeDeps()
    deps.fetchImage.mockRejectedValueOnce(new Error('reset')).mockResolvedValue(PNG)

    expect(await syncEpicCovers(['A', 'B'], KEY, deps)).toBe(1)
  })

  it('runs at most two lookups at once', async () => {
    const deps = fakeDeps()
    let running = 0
    let peak = 0
    deps.lookup.mockImplementation(async (id) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running--
      return { kind: 'found', url: coverUrl(id) }
    })

    await syncEpicCovers(['A', 'B', 'C', 'D', 'E'], KEY, deps)

    expect(peak).toBe(2)
  })
})

describe('syncEpicCovers: no cover', () => {
  it('remembers a miss and does not ask again within 7 days', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'none' })

    await syncEpicCovers(['Bloons'], KEY, deps)
    deps.clock.now += 6 * DAY
    await syncEpicCovers(['Bloons'], KEY, deps)

    expect(deps.lookup).toHaveBeenCalledTimes(1)
    expect(deps.state['Bloons']?.noCoverCheckedAt).toBe(100 * DAY)
  })

  it('asks again once 7 days have passed', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'none' })

    await syncEpicCovers(['Bloons'], KEY, deps)
    deps.clock.now += 7 * DAY
    await syncEpicCovers(['Bloons'], KEY, deps)

    expect(deps.lookup).toHaveBeenCalledTimes(2)
  })
})

describe('syncEpicCovers: failures', () => {
  it('skips a game with unusable posters and still looks up the games after it', async () => {
    const deps = fakeDeps()
    deps.lookup.mockImplementation(async (id) =>
      id === 'Odd' ? { kind: 'unusable' } : { kind: 'found', url: coverUrl(id) }
    )

    await syncEpicCovers(['Odd', 'B', 'C', 'D'], KEY, deps)

    expect([...deps.files].sort()).toEqual(['B.png', 'C.png', 'D.png'])
    expect(deps.state['Odd']?.noCoverCheckedAt).toBeUndefined()
    expect(getEpicCoverProblem()).toBeNull()
    // No backoff: the next sync asks about it again.
    await syncEpicCovers(['Odd', 'B', 'C', 'D'], KEY, deps)
    expect(deps.lookup.mock.calls.filter(([id]) => id === 'Odd')).toHaveLength(2)
  })

  it('stops at a rejected key, reports it, and sends nothing more with that key', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'keyRejected' })

    await syncEpicCovers(['A', 'B', 'C'], KEY, deps)
    const callsAfterFirstSync = deps.lookup.mock.calls.length
    await syncEpicCovers(['A', 'B', 'C'], KEY, deps)

    expect(callsAfterFirstSync).toBeLessThanOrEqual(2)
    expect(deps.lookup).toHaveBeenCalledTimes(callsAfterFirstSync)
    expect(getEpicCoverProblem()).toBe('keyRejected')
    expect(deps.state['A']?.noCoverCheckedAt).toBeUndefined()
  })

  it('backs off for 15 minutes when SteamGridDB is unavailable, without recording misses', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'unavailable', retryAfterMs: null })

    await syncEpicCovers(['A'], KEY, deps)
    deps.clock.now += 14 * 60 * 1000
    await syncEpicCovers(['A'], KEY, deps)
    expect(deps.lookup).toHaveBeenCalledTimes(1)
    expect(getEpicCoverProblem()).toBe('unavailable')
    expect(deps.state['A']?.noCoverCheckedAt).toBeUndefined()

    lookupReturns(deps, { kind: 'found', url: coverUrl('A') })
    deps.clock.now += 2 * 60 * 1000
    await syncEpicCovers(['A'], KEY, deps)
    expect(deps.lookup).toHaveBeenCalledTimes(2)
    expect(getEpicCoverProblem()).toBeNull()
  })

  it('waits longer when SteamGridDB asks for it', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'unavailable', retryAfterMs: 60 * 60 * 1000 })

    await syncEpicCovers(['A'], KEY, deps)
    deps.clock.now += 30 * 60 * 1000
    await syncEpicCovers(['A'], KEY, deps)

    expect(deps.lookup).toHaveBeenCalledTimes(1)
  })

  it('looks nothing up when the state cannot be saved', async () => {
    const deps = fakeDeps()
    deps.updateState = async () => Promise.reject(new Error('disk full'))

    expect(await syncEpicCovers(['A'], KEY, deps)).toBe(0)
    expect(deps.lookup).not.toHaveBeenCalled()
  })

  it('never rejects, even if a lookup throws', async () => {
    const deps = fakeDeps()
    deps.lookup.mockRejectedValue(new Error('bug'))

    await expect(syncEpicCovers(['A'], KEY, deps)).resolves.toBe(0)
  })
})

describe('syncEpicCovers: pruning', () => {
  it('keeps the cover of a game missing from one detection', async () => {
    const deps = fakeDeps(['Sugar.png', 'Other.png'], {
      Sugar: { lastSeenInstalled: 99 * DAY },
      Other: { lastSeenInstalled: 99 * DAY }
    })

    await syncEpicCovers(['Other'], KEY, deps)

    expect(deps.files.has('Sugar.png')).toBe(true)
    expect(deps.state['Sugar']).toBeDefined()
  })

  it('removes the cover of a game unseen for more than 30 days', async () => {
    const deps = fakeDeps(['Gone.png', 'Other.png'], {
      Gone: { lastSeenInstalled: 69 * DAY },
      Other: { lastSeenInstalled: 99 * DAY }
    })

    await syncEpicCovers(['Other'], KEY, deps)

    expect(deps.deleted).toEqual(['Gone.png'])
    expect(deps.state['Gone']).toBeUndefined()
  })

  it('removes leftover temp files and strays', async () => {
    const deps = fakeDeps(['Sugar.png', 'Sugar.png.tmp', 'notes.txt', '..png'], {
      Sugar: { lastSeenInstalled: 99 * DAY }
    })

    await syncEpicCovers(['Sugar'], KEY, deps)

    expect([...deps.files]).toEqual(['Sugar.png'])
  })

  it('keeps covers that have no saved record (state file was lost) for 30 more days', async () => {
    const deps = fakeDeps(['Sugar.png', 'Old.png'], {})

    await syncEpicCovers(['Sugar'], KEY, deps)

    expect(deps.files.has('Old.png')).toBe(true)
    expect(deps.state['Old']?.lastSeenInstalled).toBe(deps.clock.now)
  })

  it('deletes nothing when the state cannot be read or saved', async () => {
    const deps = fakeDeps(['Gone.png'], { Gone: { lastSeenInstalled: 1 } })
    deps.updateState = async () => Promise.reject(new Error('EBUSY'))

    await syncEpicCovers(['Other'], KEY, deps)

    expect(deps.deleted).toEqual([])
  })

  it('reports a state that cannot be read as unavailable when a key is saved', async () => {
    const deps = fakeDeps()
    deps.updateState = async () => Promise.reject(new Error('EPERM'))

    await syncEpicCovers(['A'], null, deps)
    expect(getEpicCoverProblem()).toBeNull()

    await syncEpicCovers(['A'], KEY, deps)
    expect(getEpicCoverProblem()).toBe('unavailable')
  })

  it('keeps "key rejected" as the message when the state is briefly unreadable', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'keyRejected' })
    await syncEpicCovers(['A'], KEY, deps)
    const saveState = deps.updateState
    deps.updateState = async () => Promise.reject(new Error('EBUSY'))

    await syncEpicCovers(['A'], KEY, deps)
    deps.updateState = saveState
    await syncEpicCovers(['A'], KEY, deps)

    expect(getEpicCoverProblem()).toBe('keyRejected')
  })

  it('keeps an expired record until its cover file is really gone', async () => {
    const deps = fakeDeps(['Gone.png', 'Other.png'], {
      Gone: { lastSeenInstalled: 69 * DAY },
      Other: { lastSeenInstalled: 99 * DAY }
    })
    const deleteFile = deps.deleteFile
    deps.deleteFile = async () => Promise.reject(new Error('EBUSY'))

    await syncEpicCovers(['Other'], KEY, deps)
    // Still expired, not adopted with a fresh 30 days.
    expect(deps.state['Gone']?.lastSeenInstalled).toBe(69 * DAY)

    deps.deleteFile = deleteFile
    await syncEpicCovers(['Other'], KEY, deps)
    expect(deps.files.has('Gone.png')).toBe(false)
    expect(deps.state['Gone']).toBeUndefined()
  })

  it('touches nothing when detection returned no games', async () => {
    const deps = fakeDeps(['Gone.png'], { Gone: { lastSeenInstalled: 1 } })

    await syncEpicCovers([], KEY, deps)

    expect(deps.deleted).toEqual([])
    expect(deps.state['Gone']).toBeDefined()
  })
})

describe('resetEpicCoverLookups', () => {
  it('lets a new key try again after the old one was rejected, and clears misses', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'none' })
    await syncEpicCovers(['Bloons'], KEY, deps)
    lookupReturns(deps, { kind: 'keyRejected' })
    deps.state['A'] = { lastSeenInstalled: deps.clock.now }
    await syncEpicCovers(['A'], KEY, deps)

    await resetEpicCoverLookups(deps)

    expect(getEpicCoverProblem()).toBeNull()
    expect(deps.state['Bloons']?.noCoverCheckedAt).toBeUndefined()
    lookupReturns(deps, { kind: 'found', url: coverUrl('A') })
    await syncEpicCovers(['A', 'Bloons'], 'b'.repeat(32), deps)
    expect(deps.files.has('A.png')).toBe(true)
    expect(deps.files.has('Bloons.png')).toBe(true)
  })

  it("aborts a lookup in flight so its answer cannot set the new key's status", async () => {
    const deps = fakeDeps()
    let release: (value: GridLookup) => void = () => undefined
    deps.lookup.mockImplementation(() => new Promise<GridLookup>((resolve) => (release = resolve)))

    const sync = syncEpicCovers(['A'], KEY, deps)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const reset = resetEpicCoverLookups(deps)
    release({ kind: 'keyRejected' })
    await Promise.all([sync, reset])

    expect(getEpicCoverProblem()).toBeNull()
  })

  it('stops a sync queued before it from running afterwards', async () => {
    const deps = fakeDeps()
    let release: (value: GridLookup) => void = () => undefined
    deps.lookup.mockImplementationOnce(
      () => new Promise<GridLookup>((resolve) => (release = resolve))
    )

    const first = syncEpicCovers(['A'], KEY, deps)
    const queued = syncEpicCovers(['B'], KEY, deps)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const reset = resetEpicCoverLookups(deps)
    release({ kind: 'none' })
    await Promise.all([first, queued, reset])

    expect(deps.lookup).toHaveBeenCalledTimes(1)
  })

  it('clears the old misses on the next sync when the reset could not save', async () => {
    const deps = fakeDeps()
    lookupReturns(deps, { kind: 'none' })
    await syncEpicCovers(['Bloons'], KEY, deps)
    const saveState = deps.updateState
    deps.updateState = async () => Promise.reject(new Error('EBUSY'))

    await resetEpicCoverLookups(deps)
    deps.updateState = saveState
    lookupReturns(deps, { kind: 'found', url: coverUrl('Bloons') })
    await syncEpicCovers(['Bloons'], 'b'.repeat(32), deps)

    expect(deps.files.has('Bloons.png')).toBe(true)
  })

  it('keeps saved covers', async () => {
    const deps = fakeDeps(['Sugar.png'], { Sugar: { lastSeenInstalled: 99 * DAY } })

    await resetEpicCoverLookups(deps)

    expect(deps.files.has('Sugar.png')).toBe(true)
  })
})

describe('getLocalEpicCoverUrls', () => {
  it('gives the app-cover URL for games with a saved cover and null for the rest', async () => {
    const urls = await getLocalEpicCoverUrls(['Sugar', 'Bloons'], {
      listFiles: async () => ['Sugar.png', 'Bloons.png.tmp']
    })

    expect(urls.get('Sugar')).toBe('app-cover://epic/Sugar')
    expect(urls.get('Bloons')).toBeNull()
  })

  it('returns nulls when the folder cannot be read', async () => {
    const urls = await getLocalEpicCoverUrls(['Sugar'], {
      listFiles: async () => Promise.reject(new Error('EACCES'))
    })

    expect(urls.get('Sugar')).toBeNull()
  })
})
