import { describe, expect, it, vi } from 'vitest'
import { createSettingsStore, type SettingsStoreDeps } from './settings-store'

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('missing'), { code: 'ENOENT' })
}

// An in-memory settings.json: `file` null means no file; `readError` makes
// every read fail the way a locked file does.
function fakeFile(initial: string | null): SettingsStoreDeps & {
  file: string | null
  readError: Error | null
  writes: string[]
  writeError: Error | null
} {
  const fake = {
    file: initial,
    readError: null as Error | null,
    writes: [] as string[],
    writeError: null as Error | null,
    readFile: async () => {
      if (fake.readError) throw fake.readError
      if (fake.file === null) throw enoent()
      return fake.file
    },
    writeFile: async (data: string) => {
      if (fake.writeError) throw fake.writeError
      fake.writes.push(data)
      fake.file = data
    }
  }
  return fake
}

describe('settings store', () => {
  it('turns updates on when there is no file yet, without writing one', async () => {
    const file = fakeFile(null)
    const store = createSettingsStore(file)
    expect(await store.read()).toEqual({ kind: 'ok', settings: { checkForUpdates: true } })
    expect(file.writes).toEqual([])
  })

  it('reads the saved switch', async () => {
    const store = createSettingsStore(fakeFile('{"checkForUpdates": false}'))
    expect(await store.read()).toEqual({ kind: 'ok', settings: { checkForUpdates: false } })
  })

  it.each([
    ['not JSON', '{ checkForUpdates'],
    ['the wrong shape', '{"checkForUpdates": "yes"}'],
    ['no switch at all', '{}']
  ])('calls a file with %s unreadable and leaves it alone', async (_name, text) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = fakeFile(text)
    const store = createSettingsStore(file)
    expect(await store.read()).toEqual({ kind: 'unreadable' })
    expect(file.writes).toEqual([])
  })

  it('calls a file that exists but cannot be read unreadable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = fakeFile('{"checkForUpdates": true}')
    file.readError = Object.assign(new Error('locked'), { code: 'EBUSY' })
    expect(await createSettingsStore(file).read()).toEqual({ kind: 'unreadable' })
  })

  it('writes the switch and keeps settings it does not know', async () => {
    const file = fakeFile('{"checkForUpdates": true, "fromANewerVersion": 3}')
    const store = createSettingsStore(file)
    expect(await store.setCheckForUpdates(false)).toBe(true)
    expect(JSON.parse(file.file ?? '')).toEqual({ checkForUpdates: false, fromANewerVersion: 3 })
    expect(await store.read()).toEqual({ kind: 'ok', settings: { checkForUpdates: false } })
  })

  it('writes a fresh file over an unreadable one when the switch is flipped', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = fakeFile('garbage')
    const store = createSettingsStore(file)
    expect(await store.setCheckForUpdates(true)).toBe(true)
    expect(JSON.parse(file.file ?? '')).toEqual({ checkForUpdates: true })
    expect(await store.read()).toEqual({ kind: 'ok', settings: { checkForUpdates: true } })
  })

  it('reports a failed write without throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = fakeFile(null)
    file.writeError = new Error('disk full')
    expect(await createSettingsStore(file).setCheckForUpdates(false)).toBe(false)
  })

  it('runs one change at a time, so the last click wins', async () => {
    const file = fakeFile(null)
    const store = createSettingsStore(file)
    await Promise.all([store.setCheckForUpdates(false), store.setCheckForUpdates(true)])
    expect(file.writes.map((w) => JSON.parse(w).checkForUpdates)).toEqual([false, true])
  })
})
