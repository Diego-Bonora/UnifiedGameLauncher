import { COVER_URL_PREFIX, type SteamOwnedGame } from '@shared/ipc/steam-channels'
import {
  isSteamCoverAssetUrl,
  lookUpLibraryCoverArt,
  runWithConcurrencyLimit,
  type LibraryCoverArtLookup
} from '../stores/steam/library-cover-art'
import {
  COVER_EXTENSIONS,
  deleteCoverFile,
  detectImageExtension,
  fetchCoverBytes,
  findCoverFileName,
  listCoverFilesIn,
  writeCoverFile
} from './cover-files'

// Steam's cover sync. The file checks, folder and URL rules it relies on are
// shared with Epic and live in cover-files.ts.

// Same reasoning as library-cover-art.ts: cap concurrency against Steam's
// edge rather than firing one request per game at once.
const MAX_CONCURRENT_DOWNLOADS = 4

export interface CoverCacheDeps {
  // File names (not paths) currently in the covers folder.
  listFiles: () => Promise<string[]>
  // Resolves to the raw bytes; the caller checks they are really an image.
  fetchImage: (url: string, signal: AbortSignal) => Promise<Uint8Array>
  writeFile: (fileName: string, bytes: Uint8Array) => Promise<void>
  deleteFile: (fileName: string) => Promise<void>
}

// The installed-games sync also looks covers up itself (no owned list to
// take them from).
export interface InstalledCoverDeps extends CoverCacheDeps {
  // `signal` lets a disconnect cancel the lookup instead of waiting for it.
  lookUp: (appIds: string[], signal: AbortSignal) => Promise<LibraryCoverArtLookup>
  now: () => number
}

const realDeps: InstalledCoverDeps = {
  listFiles: () => listCoverFilesIn('steam'),
  fetchImage: fetchCoverBytes,
  writeFile: (fileName, bytes) => writeCoverFile('steam', fileName, bytes),
  deleteFile: (fileName) => deleteCoverFile('steam', fileName),
  lookUp: (appIds, signal) => lookUpLibraryCoverArt(appIds, undefined, signal),
  now: () => Date.now()
}

// --- Installed games -----------------------------------------------------
//
// Installed games that aren't in the owned list (free-to-play, Family
// Sharing) keep their covers in the same folder, so the owned sync's cleanup
// must know which games are installed (docs/features/library-layout.md,
// "Covers"). Every game seen installed this session, not just in the latest
// read: a drive that goes to sleep mid-session hides its games from a read,
// but the window keeps showing them, so their covers must stay. null until
// the installed list has been read once.
let seenInstalled: Set<string> | null = null

// Called on every installed-list read.
export function noteInstalledSteamGames(appIds: string[]): void {
  seenInstalled ??= new Set()
  for (const appId of appIds) seenInstalled.add(appId)
}

// After a lookup request fails (offline, Steam erroring), wait this long
// before asking again, rather than on every window focus.
const LOOKUP_RETRY_AFTER_MS = 60_000
let lookupFailedAt: number | null = null

// appIds the installed sync has already dealt with this session: answered
// with no cover, or a download attempted. A lookup whose request failed isn't
// added, so it is tried again on a later read. In memory only: a new session
// asks again, which also picks up posters Steam adds later.
const installedLookedUp = new Set<string>()

// --- Syncing -------------------------------------------------------------
//
// Runs are chained one after another instead of skipped when one is already
// going: a second call may carry games the first never saw (a new purchase),
// and each run re-reads the folder, so a queued run just skips what the
// previous one already saved.
let queueTail: Promise<unknown> = Promise.resolve()

// clearCovers bumps this so runs that were queued BEFORE a disconnect don't
// download the old account's covers afterwards.
let clearGeneration = 0
let activeAbort: AbortController | null = null

// Resolves to how many covers were newly saved, so the caller can tell the
// window when there is something new to show.
async function runSync(
  games: SteamOwnedGame[],
  generation: number,
  deps: CoverCacheDeps
): Promise<number> {
  if (generation !== clearGeneration) return 0
  const controller = new AbortController()
  activeAbort = controller
  try {
    let files: string[]
    try {
      files = await deps.listFiles()
    } catch (err) {
      console.warn('[steam] could not read the covers folder:', err)
      return 0
    }

    // Prune first, but never against an empty library: an empty live result
    // is more likely a private profile or a bad response than "the user
    // owns nothing", and covers are worth keeping until that is clear.
    // Everything not belonging to a current game goes: covers of removed
    // games, and leftover ".tmp" files from an interrupted download.
    // Covers of games seen installed this session stay too, owned or not.
    // Until the installed list has been read once, nothing is pruned. A
    // drive that was already asleep at startup may lose an installed-only
    // cover here; it is fetched again once the drive's games are read.
    const existing = new Set(files)
    const installed = seenInstalled
    if (games.length > 0 && installed !== null) {
      const keepIds = [...games.map((game) => game.appId), ...installed]
      const keep = new Set(
        keepIds.flatMap((appId) => COVER_EXTENSIONS.map((ext) => `${appId}.${ext}`))
      )
      for (const name of files) {
        if (keep.has(name)) continue
        try {
          await deps.deleteFile(name)
          existing.delete(name)
        } catch (err) {
          console.warn('[steam] could not remove a stale cover file:', err)
        }
      }
    }

    return await downloadMissing(
      games.map((game) => ({ appId: game.appId, url: game.coverUrl })),
      existing,
      controller,
      deps
    )
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

// Downloads the covers that aren't on disk yet. Resolves to how many were
// saved; `onAttempted` hears about every game a download was tried for.
async function downloadMissing(
  items: { appId: string; url: string | null }[],
  existing: Set<string>,
  controller: AbortController,
  deps: CoverCacheDeps,
  onAttempted: (appId: string) => void = () => undefined
): Promise<number> {
  let downloaded = 0
  const tasks = items.flatMap(({ appId, url }) => {
    // The allow-list check happens HERE as well as on cache read: this is
    // the last gate before a network request goes out.
    if (url === null || !isSteamCoverAssetUrl(url)) return []
    if (findCoverFileName(appId, existing) !== null) return []
    return [
      async (): Promise<void> => {
        if (controller.signal.aborted) return
        try {
          const bytes = await deps.fetchImage(url, controller.signal)
          const extension = detectImageExtension(bytes)
          if (extension === null) return
          // A disconnect may have landed while this was downloading.
          if (controller.signal.aborted) return
          await deps.writeFile(`${appId}.${extension}`, bytes)
          downloaded++
        } catch (err) {
          if (controller.signal.aborted) return
          console.warn(`[steam] could not cache the cover for app ${appId}:`, err)
        } finally {
          if (!controller.signal.aborted) onAttempted(appId)
        }
      }
    ]
  })
  await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_DOWNLOADS)
  return downloaded
}

async function runInstalledSync(
  appIds: string[],
  generation: number,
  deps: InstalledCoverDeps
): Promise<number> {
  if (generation !== clearGeneration) return 0
  const controller = new AbortController()
  activeAbort = controller
  try {
    let files: string[]
    try {
      files = await deps.listFiles()
    } catch (err) {
      console.warn('[steam] could not read the covers folder:', err)
      return 0
    }
    const existing = new Set(files)
    // A cover already on disk (owned or installed) needs nothing.
    const wanted = appIds.filter(
      (appId) => !installedLookedUp.has(appId) && findCoverFileName(appId, existing) === null
    )
    if (wanted.length === 0) return 0
    if (lookupFailedAt !== null && deps.now() - lookupFailedAt < LOOKUP_RETRY_AFTER_MS) return 0

    let lookup: LibraryCoverArtLookup
    try {
      lookup = await deps.lookUp(wanted, controller.signal)
    } catch (err) {
      console.warn('[steam] could not look up installed game covers:', err)
      lookupFailedAt = deps.now()
      return 0
    }
    if (controller.signal.aborted) return 0
    lookupFailedAt = lookup.failedIds.length > 0 ? deps.now() : null

    // Asked and answered without a poster: don't ask again this session.
    // A failed request isn't an answer.
    const failed = new Set(lookup.failedIds)
    for (const appId of wanted) {
      if (!failed.has(appId) && lookup.urls[appId] === undefined) installedLookedUp.add(appId)
    }
    return await downloadMissing(
      wanted.flatMap((appId) => {
        const url = lookup.urls[appId]
        return url === undefined ? [] : [{ appId, url }]
      }),
      existing,
      controller,
      deps,
      // One try per session even when the download fails: a lookup that
      // worked means the network was up, so a failing image is more likely
      // gone than late, and a retry on every window focus would hammer it.
      (appId) => installedLookedUp.add(appId)
    )
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

// Keeps the covers folder in step with the library: removes covers that no
// longer belong, then downloads the missing ones. Resolves to the number of
// covers newly saved. Never rejects: a cover that can't be fetched just stays
// remote/placeholder, like the rest of this app's "missing art degrades
// quietly" convention.
export function syncCovers(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<number> {
  const generation = clearGeneration
  const run = queueTail.then(() => runSync(games, generation, deps))
  queueTail = run.catch(() => undefined)
  return run.catch((err: unknown) => {
    console.warn('[steam] cover sync failed:', err)
    return 0
  })
}

// Covers for installed games the owned list doesn't cover (free-to-play,
// Family Sharing, or no owned list yet): looks each one up once per session
// and saves it in the same folder. Runs in the same queue as syncCovers, so
// the two never download the same file at once, and a queued run skips what
// the other already saved. Resolves to how many covers were newly saved;
// never rejects.
export function syncInstalledCovers(
  appIds: string[],
  deps: InstalledCoverDeps = realDeps
): Promise<number> {
  const generation = clearGeneration
  const run = queueTail.then(() => runInstalledSync(appIds, generation, deps))
  queueTail = run.catch(() => undefined)
  return run.catch((err: unknown) => {
    console.warn('[steam] installed cover sync failed:', err)
    return 0
  })
}

// For disconnect: stops any running or queued downloads, waits for them to
// wind down (they abort immediately, so this is quick), then deletes every
// cached cover. Throws if a file could not be removed, so the caller doesn't
// tell the user their data is gone when it isn't.
export async function clearCovers(deps: CoverCacheDeps = realDeps): Promise<void> {
  clearGeneration++
  activeAbort?.abort()
  await queueTail
  // Every cover is about to go, so installed games must be looked up again.
  installedLookedUp.clear()
  lookupFailedAt = null
  // Back to "installed list not read yet": no cleanup can run while
  // disconnected, and the next read fills this in again.
  seenInstalled = null

  const files = await deps.listFiles()
  const results = await Promise.allSettled(files.map((name) => deps.deleteFile(name)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`[steam] could not remove ${failed.length} cached cover file(s)`)
    throw new Error('Could not remove all saved cover images.')
  }
}

// The local URL per appId whose cover is on disk, for installed games. Only
// local copies: an installed game that isn't owned has no remote URL to fall
// back to, and the renderer upgrades from placeholder when one is saved.
export async function localSteamCoverUrls(
  appIds: string[],
  deps: CoverCacheDeps = realDeps
): Promise<Map<string, string>> {
  const files = new Set(await deps.listFiles())
  return new Map(
    appIds.flatMap((appId) =>
      findCoverFileName(appId, files) !== null ? [[appId, `${COVER_URL_PREFIX}${appId}`]] : []
    )
  )
}

// Swaps in the local URL for every game whose cover is on disk; the rest keep
// their remote URL (or null). One folder listing for the whole list rather
// than a file check per game.
export async function withLocalCoverUrls(
  games: SteamOwnedGame[],
  deps: CoverCacheDeps = realDeps
): Promise<SteamOwnedGame[]> {
  const files = new Set(await deps.listFiles())
  return games.map((game) =>
    findCoverFileName(game.appId, files) !== null
      ? { ...game, coverUrl: `${COVER_URL_PREFIX}${game.appId}` }
      : game
  )
}
