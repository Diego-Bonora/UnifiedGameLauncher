import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { isValidCoverId } from './cover-files'

// Per-game bookkeeping for Epic covers, keyed by AppName:
//  - lastSeenInstalled: covers are pruned only after 30 days unseen, so a
//    game that drops out of one detection (locked manifest, mid-update)
//    keeps its cover.
//  - noCoverCheckedAt: SteamGridDB had no poster; don't ask again for 7 days.
// Nothing here is secret, so it's plain JSON like the library cache.

export interface EpicCoverGameState {
  lastSeenInstalled: number
  noCoverCheckedAt?: number
}

export type EpicCoverGames = Record<string, EpicCoverGameState>

// Same injectable-deps shape as library-cache.ts, for the same reason: the
// real path needs app.getPath, which throws under Vitest.
export interface EpicCoverStateDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function stateFilePath(): string {
  return join(app.getPath('userData'), 'epic-covers.json')
}

const realDeps: EpicCoverStateDeps = {
  readFile: () => readFile(stateFilePath(), 'utf-8'),
  writeFile: async (data) => {
    const path = stateFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

// Bump when the shape changes; any other version reads as empty, which only
// costs one round of lookups.
const STATE_VERSION = 1

const gameStateSchema = z.object({
  lastSeenInstalled: z.number(),
  noCoverCheckedAt: z.number().optional()
})

const fileSchema = z.object({
  version: z.literal(STATE_VERSION),
  games: z.record(z.string(), z.unknown())
})

// A missing file (first run) reads as "nothing known yet". Unreadable content
// (corrupt or an old version) does too: the sync adopts any cover files it
// finds without an entry, so starting fresh never deletes covers. Any other
// read failure (a Windows file lock from antivirus or the indexer) throws:
// treating it as empty would save a near-empty state over the good file.
// One bad entry (or a key that isn't a valid AppName) only drops that entry.
async function readGames(deps: EpicCoverStateDeps): Promise<EpicCoverGames> {
  // No prototype: "__proto__" passes the AppName character rule, and on a
  // plain {} assigning it would replace the prototype instead of adding a game.
  const games: EpicCoverGames = Object.create(null) as EpicCoverGames
  let text: string
  try {
    text = await deps.readFile()
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return games
    console.warn('[epic-covers] could not read the cover state:', err)
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return games
  }
  const file = fileSchema.safeParse(parsed)
  if (!file.success) return games
  for (const [appName, value] of Object.entries(file.data.games)) {
    const entry = gameStateSchema.safeParse(value)
    if (entry.success && isValidCoverId('epic', appName)) games[appName] = entry.data
  }
  return games
}

// Serialized for the same reason as library-cache.ts: two read-modify-writes
// racing would lose one of them.
let writeQueue: Promise<unknown> = Promise.resolve()

// The only way in: every read happens inside the write queue, so a read can
// never land in the middle of another update's rename. Runs `mutate` on a
// fresh copy of the saved games, saves the result and returns it. Throws if
// reading or saving failed, so the caller doesn't act on state that isn't
// on disk.
export function updateEpicCoverState(
  mutate: (games: EpicCoverGames) => void,
  deps: EpicCoverStateDeps = realDeps
): Promise<EpicCoverGames> {
  const task = async (): Promise<EpicCoverGames> => {
    const games = await readGames(deps)
    mutate(games)
    try {
      await deps.writeFile(JSON.stringify({ version: STATE_VERSION, games }))
    } catch (err) {
      console.warn('[epic-covers] could not save the cover state:', err)
      throw err
    }
    return games
  }
  const result = writeQueue.then(task, task)
  writeQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
