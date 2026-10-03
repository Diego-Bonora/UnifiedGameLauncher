import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import {
  hasValidArgsCharacters,
  hasValidTitleCharacters,
  manualIdSchema,
  MAX_ARGS_LENGTH,
  MAX_TITLE_LENGTH
} from '@shared/ipc/manual'
import type { ManualCoverSource } from '@shared/ipc/manual'

// manual-games.json: the games the user added by picking an .exe
// (docs/features/library-tools.md, "Saved data").

export interface SavedManualGame {
  id: string
  title: string
  exePath: string
  args: string
  coverSource: ManualCoverSource
  // Step 4 (covers) fills these in.
  steamAppId?: string
  coverMissTitle?: string
  iconFor?: string
}

export interface ManualGamesFileDeps {
  readFile: () => Promise<string>
  writeFile: (data: string) => Promise<void>
}

function manualGamesFilePath(): string {
  return join(app.getPath('userData'), 'manual-games.json')
}

const realDeps: ManualGamesFileDeps = {
  readFile: () => readFile(manualGamesFilePath(), 'utf-8'),
  writeFile: async (data) => {
    // Temp file then rename, so a crash mid-write can't leave a half-written
    // file behind.
    const path = manualGamesFilePath()
    const tempPath = `${path}.tmp`
    await writeFile(tempPath, data, 'utf-8')
    await rename(tempPath, path)
  }
}

// Loose objects: a field a later version adds survives a save by this one.
// Titles and arguments follow the same rules as the IPC (length, visible
// characters only), so a hand-edited line break can never reach the command
// line, and the edit form can always save back what it was shown.
const gameSchema = z.looseObject({
  id: manualIdSchema,
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).refine(hasValidTitleCharacters),
  exePath: z.string().min(1).max(32_767),
  args: z.string().trim().max(MAX_ARGS_LENGTH).refine(hasValidArgsCharacters),
  coverSource: z.enum(['steam', 'icon']),
  steamAppId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  coverMissTitle: z.string().max(MAX_TITLE_LENGTH).optional(),
  iconFor: z.string().max(32_767).optional()
})

const fileSchema = z.looseObject({
  games: z.array(gameSchema).max(10_000)
})

export type ManualGamesRead = { readable: true; games: SavedManualGame[] } | { readable: false }

// One bad entry makes the whole file unreadable, rather than being dropped:
// the next save would otherwise delete that game for good.
async function readManualGamesFile(deps: ManualGamesFileDeps): Promise<ManualGamesRead> {
  let text: string
  try {
    text = await deps.readFile()
  } catch (err) {
    // No file yet is the normal first run.
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT')
      return { readable: true, games: [] }
    console.warn('[manual] could not read manual-games.json:', err)
    return { readable: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    console.warn('[manual] manual-games.json is not valid JSON:', err)
    return { readable: false }
  }
  const result = fileSchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[manual] manual-games.json has an unexpected shape:', result.error.message)
    return { readable: false }
  }
  const ids = new Set(result.data.games.map((game) => game.id))
  if (ids.size !== result.data.games.length) {
    console.warn('[manual] manual-games.json has two games with the same id')
    return { readable: false }
  }
  return { readable: true, games: result.data.games }
}

// What a change decided: the new list to save, or why nothing changes.
export type ManualGamesEdit<F extends string> = { games: SavedManualGame[] } | { failure: F }

export type ManualGamesUpdate<F extends string> =
  | { saved: true; games: SavedManualGame[] }
  | { saved: false; reason: F | 'unreadable' | 'cannotSave'; games: SavedManualGame[] | null }

export interface ManualGamesFile {
  read: () => Promise<ManualGamesRead>
  // Runs `edit` on the freshly read list and saves its result. Never rejects
  // for expected problems. `games` in a failure is the list as saved (null
  // when the file couldn't be read).
  update: <F extends string>(
    edit: (games: SavedManualGame[]) => Promise<ManualGamesEdit<F>>
  ) => Promise<ManualGamesUpdate<F>>
}

export function createManualGamesFile(deps: ManualGamesFileDeps = realDeps): ManualGamesFile {
  // One read-modify-write at a time (same reason as favorites-store.ts), and
  // reads wait for a save in progress.
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
    read: () => enqueue(() => readManualGamesFile(deps)),
    update: (edit) =>
      enqueue(async () => {
        const read = await readManualGamesFile(deps)
        // Never write over a file that couldn't be read: it may hold every
        // game the user added.
        if (!read.readable) return { saved: false, reason: 'unreadable', games: null }
        const outcome = await edit(read.games)
        if ('failure' in outcome)
          return { saved: false, reason: outcome.failure, games: read.games }
        try {
          await deps.writeFile(JSON.stringify({ games: outcome.games }, null, 2))
        } catch (err) {
          console.warn('[manual] could not save manual-games.json:', err)
          return { saved: false, reason: 'cannotSave', games: read.games }
        }
        return { saved: true, games: outcome.games }
      })
  }
}
