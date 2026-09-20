import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'

// A discriminated union instead of two independent fields: makes
// {status: 'connected', steamId64: null} unrepresentable rather than just
// "shouldn't happen".
export type SteamConnection =
  { status: 'connected'; steamId64: string } | { status: 'disconnected'; steamId64: null }

const steamConnectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), steamId64: z.string().regex(/^\d{17}$/) }),
  z.object({ status: z.literal('disconnected'), steamId64: z.null() })
]) satisfies z.ZodType<SteamConnection>

const DISCONNECTED: SteamConnection = { status: 'disconnected', steamId64: null }

// No `path` parameter: the real path is resolved lazily inside realDeps,
// only when it actually runs. That keeps app.getPath (which needs a running
// Electron process and throws under Vitest) out of the code path tests use.
export interface ConnectionStoreDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function connectionsFilePath(): string {
  return join(app.getPath('userData'), 'connections.json')
}

const realDeps: ConnectionStoreDeps = {
  readFile: () => readFile(connectionsFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a half-written
    // connections.json behind.
    const path = connectionsFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

// The file is a plain object keyed by store ("steam", eventually "epic"
// too), but only the "steam" key is understood here. Reading it as an
// untyped record — rather than a schema covering the whole file — lets a
// write from one store round-trip whatever key another store owns without
// needing to know its shape.
async function readRawConnectionsFile(deps: ConnectionStoreDeps): Promise<Record<string, unknown>> {
  try {
    const text = await deps.readFile()
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    // Missing file (first run) or corrupt JSON both degrade to "nothing
    // saved yet" rather than throwing.
    return {}
  }
}

export async function getSteamConnection(
  deps: ConnectionStoreDeps = realDeps
): Promise<SteamConnection> {
  const raw = await readRawConnectionsFile(deps)
  const result = steamConnectionSchema.safeParse(raw['steam'])
  // A missing key or a shape that fails validation both degrade to
  // "disconnected" rather than throwing — the renderer never has to treat a
  // broken connections.json as an error.
  return result.success ? result.data : DISCONNECTED
}

// Serializes every read-modify-write against this file behind a single
// module-level queue. Without it, two concurrent writers (this file's own
// comment above already anticipates a future setEpicConnection) could both
// read the same stale snapshot — the second write would silently lose the
// first's key — or collide on the same fixed temp-file path mid-write.
// Queuing the whole read+write per call, not just the write, closes both
// gaps: only one call is ever inside its read-modify-write at a time.
let writeQueue: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task)
  // A failed task must not wedge every later one — but the failure itself
  // still propagates to whoever awaited `result`.
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export async function setSteamConnection(
  connection: SteamConnection,
  deps: ConnectionStoreDeps = realDeps
): Promise<void> {
  await enqueueWrite(async () => {
    // Read-merge-write, not overwrite: this file will eventually also hold
    // Epic's connection under its own key, and a plain overwrite here would
    // silently wipe it.
    const raw = await readRawConnectionsFile(deps)
    raw['steam'] = connection
    try {
      await deps.writeFile(JSON.stringify(raw, null, 2))
    } catch (err) {
      console.warn('[steam] could not save connection status:', err)
      throw err
    }
  })
}

export async function clearSteamConnection(deps: ConnectionStoreDeps = realDeps): Promise<void> {
  await setSteamConnection(DISCONNECTED, deps)
}
