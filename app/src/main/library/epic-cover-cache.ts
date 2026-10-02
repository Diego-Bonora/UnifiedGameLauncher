import type { EpicCoverProblem } from '@shared/ipc/epic-channels'
import { runWithConcurrencyLimit } from '../stores/steam/library-cover-art'
import {
  coverIdFromFileName,
  coverUrlFor,
  deleteCoverFile,
  detectImageExtension,
  fetchCoverBytes,
  findCoverFileName,
  isAnimatedImage,
  isValidCoverId,
  listCoverFilesIn,
  writeCoverFile
} from './cover-files'
import { updateEpicCoverState, type EpicCoverGames } from './epic-cover-state'
import { isSteamGridDbImageUrl, lookupEpicGrid, type GridLookup } from './steamgriddb'

// Epic's cover sync: posters from SteamGridDB for installed Epic games. The
// rules come from docs/features/epic-covers.md; the file safety rules are
// shared with Steam via cover-files.ts.

const DAY_MS = 24 * 60 * 60 * 1000
// A game unseen this long has really been uninstalled; its cover goes.
const PRUNE_AFTER_MS = 30 * DAY_MS
// SteamGridDB said "no cover"; worth asking again after this.
const NO_COVER_RECHECK_MS = 7 * DAY_MS
// After offline, a rate limit or server trouble, no new lookups for at least
// this long (longer if SteamGridDB sends Retry-After).
const BACKOFF_MS = 15 * 60 * 1000
// Gentler than Steam's 4: this is a free, community-run service.
const MAX_CONCURRENT_LOOKUPS = 2

// One definition, shared with the window, so a new value can't reach the UI
// without wording for it.
export type { EpicCoverProblem } from '@shared/ipc/epic-channels'

export interface EpicCoverCacheDeps {
  listFiles: () => Promise<string[]>
  fetchImage: (url: string, signal: AbortSignal) => Promise<Uint8Array>
  writeFile: (fileName: string, bytes: Uint8Array) => Promise<void>
  deleteFile: (fileName: string) => Promise<void>
  lookup: (appName: string, apiKey: string, signal: AbortSignal) => Promise<GridLookup>
  updateState: (mutate: (games: EpicCoverGames) => void) => Promise<EpicCoverGames>
  now: () => number
}

const realDeps: EpicCoverCacheDeps = {
  listFiles: () => listCoverFilesIn('epic'),
  fetchImage: fetchCoverBytes,
  writeFile: (fileName, bytes) => writeCoverFile('epic', fileName, bytes),
  deleteFile: (fileName) => deleteCoverFile('epic', fileName),
  lookup: (appName, apiKey, signal) => lookupEpicGrid(appName, apiKey, signal),
  updateState: (mutate) => updateEpicCoverState(mutate),
  now: Date.now
}

// --- Module state ---------------------------------------------------------
//
// Lives for the app session only. After a restart, one lookup is enough to
// find out again that a key is rejected or SteamGridDB is down.
let queueTail: Promise<unknown> = Promise.resolve()
// resetEpicCoverLookups bumps this so runs queued under an old key don't
// start afterwards.
let generation = 0
let activeAbort: AbortController | null = null
// The key SteamGridDB rejected; no requests with it until it changes.
let rejectedKey: string | null = null
let backoffUntil = 0
let problem: EpicCoverProblem | null = null
// Set when a reset couldn't clear the "no cover" marks; the next sync clears
// them in its own state update instead, so a new key isn't stuck behind an
// old key's misses for 7 days.
let clearMissesPending = false

// The covers folder or the state file couldn't be used (often a brief lock
// by antivirus). With a key saved, that shows as "unavailable" and starts the
// same backoff as a SteamGridDB outage, so focus retries wait for it instead
// of repeating the failing disk work and its warning on every alt-tab. A
// rejected key stays the message: it's what the user must fix. A run cut off
// by a key change belongs to the old key and sets nothing.
function markLocalFailure(apiKey: string | null, runGeneration: number, now: number): void {
  if (apiKey === null || apiKey === rejectedKey || runGeneration !== generation) return
  problem = 'unavailable'
  backoffUntil = Math.max(backoffUntil, now + BACKOFF_MS)
}

async function runSync(
  appNames: string[],
  apiKey: string | null,
  runGeneration: number,
  deps: EpicCoverCacheDeps
): Promise<number> {
  if (runGeneration !== generation) return 0
  const installed = [...new Set(appNames.filter((id) => isValidCoverId('epic', id)))]
  // An empty list is more likely a failed detection (launcher uninstalled,
  // folder unreadable) than "no games"; it must never prune anything.
  if (installed.length === 0) return 0

  const controller = new AbortController()
  activeAbort = controller
  try {
    const now = deps.now()
    const installedSet = new Set(installed)

    let files: string[]
    try {
      files = await deps.listFiles()
    } catch (err) {
      console.warn('[epic-covers] could not read the covers folder:', err)
      markLocalFailure(apiKey, runGeneration, now)
      return 0
    }

    const clearingMisses = clearMissesPending
    // Entries past 30 days unseen. Their records are removed only once their
    // cover file is really gone (below): removing the record first would let
    // a file whose delete failed be adopted again with a fresh 30 days, over
    // and over.
    const expired = new Set<string>()
    let games: EpicCoverGames
    try {
      games = await deps.updateState((saved) => {
        // A cover on disk with no entry means the state was lost (corrupt or
        // old-version file). It gets a fresh 30 days rather than being
        // deleted below.
        for (const name of files) {
          const id = coverIdFromFileName('epic', name)
          if (id !== null && saved[id] === undefined) saved[id] = { lastSeenInstalled: now }
        }
        for (const id of installed) saved[id] = { ...saved[id], lastSeenInstalled: now }
        for (const [id, entry] of Object.entries(saved)) {
          if (!installedSet.has(id) && now - entry.lastSeenInstalled > PRUNE_AFTER_MS) {
            expired.add(id)
          }
          if (clearingMisses) delete entry.noCoverCheckedAt
        }
      })
    } catch {
      // Already logged. A state that can't be read or saved must not drive
      // pruning, and without it misses can't be remembered, so looking
      // anything up could repeat on every sync. With a key saved, the user
      // would otherwise see placeholders with no explanation.
      // A rejected key stays the message: it's what the user must fix, and
      // later syncs stop at the rejected-key check before anything could
      // replace a wrong "unavailable".
      // ...unless a key change arrived meanwhile: this run belongs to the old
      // key and must not set the new key's status.
      markLocalFailure(apiKey, runGeneration, now)
      return 0
    }
    // Only clear the flag if no newer reset asked for it in the meantime.
    if (clearingMisses && runGeneration === generation) clearMissesPending = false

    // A file stays only if it is a finished cover of a game still in the
    // state and not expired (installed now, or seen within 30 days). Leftover
    // ".tmp" files and strays go too.
    const existing = new Set(files)
    for (const name of files) {
      const id = coverIdFromFileName('epic', name)
      if (id !== null && id in games && !expired.has(id)) continue
      try {
        await deps.deleteFile(name)
        existing.delete(name)
      } catch (err) {
        console.warn('[epic-covers] could not remove a stale cover file:', err)
      }
    }
    const gone = [...expired].filter((id) => findCoverFileName(id, existing) === null)
    if (gone.length > 0) {
      // Best effort: a record left behind stays expired, so the next sync
      // removes it.
      await deps
        .updateState((saved) => {
          for (const id of gone) delete saved[id]
        })
        .catch(() => undefined)
    }

    if (apiKey === null || apiKey === rejectedKey || now < backoffUntil) return 0

    const todo = installed.filter((id) => {
      if (findCoverFileName(id, existing) !== null) return false
      const checkedAt = games[id]?.noCoverCheckedAt
      return checkedAt === undefined || now - checkedAt >= NO_COVER_RECHECK_MS
    })
    // Nothing left to ask about, so an old "unavailable" no longer describes
    // anything the user is missing.
    if (todo.length === 0) {
      if (runGeneration === generation) problem = null
      return 0
    }

    let downloaded = 0
    let halted = false
    let answered = false
    const misses: string[] = []
    const tasks = todo.map((id) => async (): Promise<void> => {
      if (halted || controller.signal.aborted) return
      const result = await deps.lookup(id, apiKey, controller.signal)
      // A key change landed while this was in flight: its answer belongs to
      // the old key and must not set the new key's status.
      if (controller.signal.aborted) return
      switch (result.kind) {
        case 'keyRejected':
          halted = true
          rejectedKey = apiKey
          problem = 'keyRejected'
          return
        case 'unavailable':
          halted = true
          backoffUntil = now + Math.max(BACKOFF_MS, result.retryAfterMs ?? 0)
          problem = 'unavailable'
          return
        case 'none':
          answered = true
          misses.push(id)
          return
        case 'unusable':
          // Already logged. The service answered, so it isn't down; this game
          // just gets no cover this time and is asked about again next sync.
          answered = true
          return
        case 'found':
          answered = true
          await saveCover(id, result.url, controller.signal, deps).then((saved) => {
            if (saved) downloaded++
          })
      }
    })
    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_LOOKUPS)

    if (controller.signal.aborted) return downloaded
    if (answered && !halted) problem = null
    if (misses.length > 0) {
      await deps
        .updateState((saved) => {
          for (const id of misses) {
            const entry = saved[id]
            if (entry !== undefined) entry.noCoverCheckedAt = now
          }
        })
        .catch(() => undefined)
    }
    return downloaded
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

// A bad download is not recorded as "no cover": the poster exists, so the
// next sync tries again.
async function saveCover(
  id: string,
  url: string,
  signal: AbortSignal,
  deps: EpicCoverCacheDeps
): Promise<boolean> {
  // Last gate before a request goes out, even though the API client already
  // filtered on it.
  if (!isSteamGridDbImageUrl(url)) return false
  try {
    const bytes = await deps.fetchImage(url, signal)
    const extension = detectImageExtension(bytes)
    if (extension === null || isAnimatedImage(bytes)) {
      console.warn(`[epic-covers] the cover for ${id} was not a still image; skipped`)
      return false
    }
    if (signal.aborted) return false
    await deps.writeFile(`${id}.${extension}`, bytes)
    return true
  } catch (err) {
    if (!signal.aborted) console.warn(`[epic-covers] could not cache the cover for ${id}:`, err)
    return false
  }
}

// Brings covers in line with the installed games: records who is installed,
// prunes covers of games gone for 30 days, then (with a key) fetches missing
// posters. Resolves to the number of covers newly saved. Never rejects.
// Runs are chained, not skipped: a later call may carry a newly installed
// game, and each run re-reads the folder, so it skips what the last one saved.
export function syncEpicCovers(
  appNames: string[],
  apiKey: string | null,
  deps: EpicCoverCacheDeps = realDeps
): Promise<number> {
  const runGeneration = generation
  const run = queueTail.then(() => runSync(appNames, apiKey, runGeneration, deps))
  queueTail = run.catch(() => undefined)
  return run.catch((err: unknown) => {
    console.warn('[epic-covers] cover sync failed:', err)
    return 0
  })
}

// For saving or removing the SteamGridDB key: stops lookups in progress or
// queued under the old key, forgets the rejected-key and backoff status, and
// clears "no cover" marks (an old key's answers say nothing about a new
// one). Saved covers stay. Never rejects.
export async function resetEpicCoverLookups(deps: EpicCoverCacheDeps = realDeps): Promise<void> {
  generation++
  activeAbort?.abort()
  rejectedKey = null
  backoffUntil = 0
  problem = null
  await queueTail
  await deps
    .updateState((saved) => {
      for (const entry of Object.values(saved)) delete entry.noCoverCheckedAt
    })
    .then(
      () => {
        clearMissesPending = false
      },
      () => {
        clearMissesPending = true
      }
    )
}

export function getEpicCoverProblem(): EpicCoverProblem | null {
  return problem
}

// True while lookups are paused after a failure. The IPC layer skips its
// focus retries until then: a sync now would only rewrite the state file.
export function isEpicCoverBackoffActive(now: number = Date.now()): boolean {
  return now < backoffUntil
}

// The local cover URL for each game that has one on disk, null for the rest.
// One folder listing for the whole list.
export async function getLocalEpicCoverUrls(
  appNames: string[],
  deps: Pick<EpicCoverCacheDeps, 'listFiles'> = realDeps
): Promise<Map<string, string | null>> {
  let files: Set<string>
  try {
    files = new Set(await deps.listFiles())
  } catch {
    files = new Set()
  }
  return new Map(
    appNames.map((id) => [
      id,
      isValidCoverId('epic', id) && findCoverFileName(id, files) !== null
        ? coverUrlFor('epic', id)
        : null
    ])
  )
}
