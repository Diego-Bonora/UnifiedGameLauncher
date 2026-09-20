import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

// Generic key -> encrypted-string store, not a Steam-specific one: the
// Steam Web API key is the first secret, but Epic's tokens (Milestone 4)
// will need the same encrypted-file treatment. Callers own their own key
// names (see STEAM_API_KEY_SECRET in ipc/steam-auth.ts); this file only
// knows how to encrypt, store and retrieve a string by key.
export interface SecretStoreDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
  isEncryptionAvailable: () => boolean
  encrypt: (plainText: string) => Buffer
  decrypt: (encrypted: Buffer) => string
}

function secretsFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

// Real path resolution and safeStorage calls stay lazy inside realDeps, only
// reached when it actually runs — same reason as connection-store.ts: it
// keeps Electron APIs that need a running app (and throw under Vitest) out
// of the code path tests exercise.
const realDeps: SecretStoreDeps = {
  readFile: () => readFile(secretsFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a
    // half-written secrets.json behind.
    const path = secretsFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  },
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plainText) => safeStorage.encryptString(plainText),
  decrypt: (encrypted) => safeStorage.decryptString(encrypted)
}

// safeStorage.encryptString returns a Buffer; JSON can't hold raw binary, so
// each value is base64 on disk. Only the top-level file shape is checked
// here — per-key values are read as `unknown` and left untouched, even if
// one isn't a string (corrupted, or a future key with an unexpected shape).
// getSecret's own type check + decrypt try/catch is what makes reading a
// bad value safe; filtering it out here as well would mean writing back a
// copy of the file with that key silently deleted, wiping a DIFFERENT
// secret every time an unrelated setSecret/clearSecret call ran.
async function readRawSecretsFile(deps: SecretStoreDeps): Promise<Record<string, unknown>> {
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

// Same reasoning as connection-store.ts's write queue: this file will hold
// more than one secret (Steam's key today, Epic's tokens later), so every
// read-modify-write is serialized to stop two concurrent writers from
// clobbering each other via a stale read or a colliding temp-file path.
let writeQueue: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task)
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

async function mutateSecretsFile(
  deps: SecretStoreDeps,
  mutate: (raw: Record<string, unknown>) => void
): Promise<void> {
  await enqueueWrite(async () => {
    const raw = await readRawSecretsFile(deps)
    mutate(raw)
    try {
      await deps.writeFile(JSON.stringify(raw, null, 2))
    } catch (err) {
      console.warn('[secret-store] could not save secrets file:', err)
      throw err
    }
  })
}

export async function getSecret(
  key: string,
  deps: SecretStoreDeps = realDeps
): Promise<string | null> {
  const raw = await readRawSecretsFile(deps)
  const stored = raw[key]
  if (typeof stored !== 'string') return null
  try {
    return deps.decrypt(Buffer.from(stored, 'base64'))
  } catch (err) {
    // Corrupt data, or data encrypted under a different Windows user/DPAPI
    // key, both degrade to "not saved" rather than throwing — the caller
    // never has to treat a broken secrets.json as an error.
    console.warn(`[secret-store] could not decrypt "${key}":`, err)
    return null
  }
}

export async function setSecret(
  key: string,
  value: string,
  deps: SecretStoreDeps = realDeps
): Promise<void> {
  if (!deps.isEncryptionAvailable()) {
    // Refuse rather than fall back to writing plaintext: CLAUDE.md requires
    // secrets to go through safeStorage only.
    throw new Error('This computer cannot securely store secrets right now.')
  }
  await mutateSecretsFile(deps, (raw) => {
    raw[key] = deps.encrypt(value).toString('base64')
  })
}

export async function clearSecret(key: string, deps: SecretStoreDeps = realDeps): Promise<void> {
  await mutateSecretsFile(deps, (raw) => {
    delete raw[key]
  })
}
