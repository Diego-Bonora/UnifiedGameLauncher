import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'

// The app's own settings in settings.json (docs/features/release.md,
// section 4). Today only the "Check for updates automatically" switch.

export interface Settings {
  checkForUpdates: boolean
}

export const DEFAULT_SETTINGS: Settings = { checkForUpdates: true }

export interface SettingsStoreDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const realDeps: SettingsStoreDeps = {
  readFile: () => readFile(settingsFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a half-written
    // settings.json behind.
    const path = settingsFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

// loose(): a setting a newer version added is kept when this version saves.
const fileSchema = z.looseObject({ checkForUpdates: z.boolean() })

// `unreadable`: the file exists but can't be read or has the wrong shape.
// The caller treats updates as off (the user's call in the spec), and the
// file is left alone until the user changes a setting.
export type SettingsRead = { kind: 'ok'; settings: Settings } | { kind: 'unreadable' }

type FileRead =
  { kind: 'missing' } | { kind: 'ok'; data: z.infer<typeof fileSchema> } | { kind: 'unreadable' }

async function readSettingsFile(deps: SettingsStoreDeps): Promise<FileRead> {
  let text: string
  try {
    text = await deps.readFile()
  } catch (err) {
    // No file yet is the normal first run: the defaults apply.
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { kind: 'missing' }
    console.warn('[settings] could not read settings.json:', err)
    return { kind: 'unreadable' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    console.warn('[settings] settings.json is not valid JSON:', err)
    return { kind: 'unreadable' }
  }
  const result = fileSchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[settings] settings.json has an unexpected shape')
    return { kind: 'unreadable' }
  }
  return { kind: 'ok', data: result.data }
}

export interface SettingsStore {
  // Never rejects.
  read: () => Promise<SettingsRead>
  // Never rejects: false when the file couldn't be written. Over an
  // unreadable file it writes a fresh one: flipping the switch is the user's
  // way out of that state.
  setCheckForUpdates: (enabled: boolean) => Promise<boolean>
}

export function createSettingsStore(deps: SettingsStoreDeps = realDeps): SettingsStore {
  // One read-modify-write at a time (same reason as favorites-store.ts).
  let queue: Promise<unknown> = Promise.resolve()
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task)
    queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  return {
    read: () =>
      enqueue(async (): Promise<SettingsRead> => {
        const file = await readSettingsFile(deps)
        if (file.kind === 'unreadable') return file
        if (file.kind === 'missing') return { kind: 'ok', settings: { ...DEFAULT_SETTINGS } }
        return { kind: 'ok', settings: { checkForUpdates: file.data.checkForUpdates } }
      }),

    setCheckForUpdates: (enabled) =>
      enqueue(async () => {
        const file = await readSettingsFile(deps)
        const base = file.kind === 'ok' ? file.data : {}
        try {
          await deps.writeFile(JSON.stringify({ ...base, checkForUpdates: enabled }, null, 2))
          return true
        } catch (err) {
          console.warn('[settings] could not save settings.json:', err)
          return false
        }
      })
  }
}
