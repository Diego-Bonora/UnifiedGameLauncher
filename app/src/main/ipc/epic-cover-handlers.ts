import {
  epicCoverKeyRequestSchema,
  type EpicClearCoverKeyResult,
  type EpicCoverProblem,
  type EpicCoverStatus,
  type EpicSetCoverKeyResult
} from '@shared/ipc/epic'
import type { EpicListCovers } from './epic-handlers'

// The logic behind the Epic cover channels: the SteamGridDB key, the status
// shown in the Epic section, and when covers are fetched. Free of Electron
// imports so it can be tested directly; ipc/epic.ts wires the real pieces in.

export interface EpicCoverHandlerDeps {
  getKey: () => Promise<string | null>
  saveKey: (apiKey: string) => Promise<void>
  removeKey: () => Promise<void>
  // AppNames detected right now; [] if detection failed.
  detect: () => Promise<string[]>
  // Never rejects; resolves to how many covers were newly saved.
  sync: (appNames: string[], apiKey: string | null) => Promise<number>
  // Never rejects.
  reset: () => Promise<void>
  getProblem: () => EpicCoverProblem | null
  // True while the cover cache is waiting out a failure.
  isBackoffActive: () => boolean
  localUrls: (appNames: string[]) => Promise<Map<string, string | null>>
  notify: () => void
}

export interface EpicCoverHandlers {
  listCovers: EpicListCovers
  getStatus: () => Promise<EpicCoverStatus>
  setKey: (rawRequest: unknown) => Promise<EpicSetCoverKeyResult>
  clearKey: () => Promise<EpicClearCoverKeyResult>
}

// Order-free signature of an installed-games list.
const signatureOf = (appNames: string[]): string => [...appNames].sort().join('\n')

export function createEpicCoverHandlers(deps: EpicCoverHandlerDeps): EpicCoverHandlers {
  // The list is re-read on every window focus. A sync runs only when the list
  // differs from the last one synced (startup, an install or uninstall, a key
  // change, which clears this) or when the last sync failed.
  let lastSynced: string | null = null
  // Set when the last sync failed (offline, SteamGridDB trouble, unreadable
  // state) or the key couldn't be read, so the next list read tries again.
  // The cover cache's 15-minute backoff keeps those retries from reaching
  // SteamGridDB early.
  let retryOnNextList = false
  // What the window was last told, so a background sync that changes the
  // status (key rejected, SteamGridDB down, back up) tells it to re-read.
  let reportedProblem: EpicCoverProblem | null = null
  // Bumped on every key change. A sync that read the key before a change
  // must not start afterwards with the old key; the cover cache's own reset
  // only stops syncs that were already queued.
  let keyEpoch = 0
  // The latest key-change reset. Syncs wait for it, so none can slip in
  // before the old key's "no cover" marks are cleared.
  let resetDone: Promise<void> = Promise.resolve()

  // What the window shows: no key means no problem to report.
  const visibleProblem = (hasKey: boolean): EpicCoverProblem | null =>
    hasKey ? deps.getProblem() : null

  // The one gate both the list read and the post-key-change refetch go
  // through, so they can't start two syncs for the same games.
  function maybeSync(appNames: string[]): void {
    if (appNames.length === 0) return
    const signature = signatureOf(appNames)
    const isRetry = signature === lastSynced
    // A retry during the backoff would only rewrite the state file; wait it
    // out (the flag stays set, so the first focus after it retries).
    if (isRetry && (!retryOnNextList || deps.isBackoffActive())) return
    lastSynced = signature
    retryOnNextList = false
    const epoch = keyEpoch
    void (async () => {
      await resetDone
      const apiKey = await deps.getKey()
      if (epoch !== keyEpoch) return
      if (apiKey === null) {
        // No key, or one that couldn't be read right now (a locked secrets
        // file reads as "none"): check again next time. A new list still
        // gets the housekeeping (last-seen dates, pruning, leftover files),
        // which needs no network; a retry of the same list skips it.
        retryOnNextList = true
        if (!isRetry) await deps.sync(appNames, null)
        return
      }
      const downloaded = await deps.sync(appNames, apiKey)
      if (epoch !== keyEpoch) {
        // Cut off by a key change, but covers it saved before that are on
        // disk and worth showing; the status is the new key's business.
        if (downloaded > 0) deps.notify()
        return
      }
      const problem = visibleProblem(true)
      if (problem === 'unavailable') retryOnNextList = true
      if (downloaded > 0 || problem !== reportedProblem) {
        reportedProblem = problem
        deps.notify()
      }
    })().catch((err: unknown) => {
      // Covers are decoration; nothing the user did failed.
      retryOnNextList = true
      console.warn('[epic-covers] background cover sync failed:', err)
    })
  }

  async function getStatus(): Promise<EpicCoverStatus> {
    const hasKey = (await deps.getKey()) !== null
    const problem = visibleProblem(hasKey)
    reportedProblem = problem
    return { hasKey, problem }
  }

  // After a key was saved or removed: forget the old key's lookups. Bumped
  // synchronously, before any await, so a sync already reading the old key
  // sees the change.
  function startKeyChange(): void {
    keyEpoch++
    lastSynced = null
    retryOnNextList = false
    reportedProblem = null
    resetDone = deps.reset()
  }

  return {
    listCovers: {
      urlsFor: deps.localUrls,
      onListed: maybeSync
    },

    getStatus,

    setKey: async (rawRequest) => {
      const request = epicCoverKeyRequestSchema.safeParse(rawRequest)
      if (!request.success) return { saved: false, reason: 'invalidKey' }
      try {
        await deps.saveKey(request.data.apiKey)
      } catch (err) {
        // safeStorage unavailable, or the secrets file couldn't be written.
        console.warn('[epic-covers] could not save the SteamGridDB key:', err)
        return { saved: false, reason: 'cannotStore' }
      }
      startKeyChange()
      // Fetch for what's installed now. Not awaited, so saving returns at
      // once; new covers arrive through the coversChanged event. A list read
      // in the meantime goes through the same gate and won't double it.
      void resetDone
        .then(() => deps.detect())
        .then(maybeSync)
        .catch((err: unknown) => {
          console.warn('[epic-covers] could not refetch covers after a key change:', err)
        })
      return { saved: true, status: { hasKey: true, problem: null } }
    },

    clearKey: async () => {
      try {
        await deps.removeKey()
      } catch (err) {
        // The key is still saved, so nothing changes: lookups and the status
        // the user sees stay as they were, rather than pretending it's gone.
        console.warn('[epic-covers] could not remove the SteamGridDB key:', err)
        return { cleared: false, status: await getStatus() }
      }
      // Saved covers stay (they're plain images).
      startKeyChange()
      await resetDone
      return { cleared: true, status: await getStatus() }
    }
  }
}
