import { MANUAL_COVER_URL_PREFIX, MANUAL_ID_PATTERN } from '@shared/ipc/manual'
import {
  coverIdFromFileName,
  detectImageExtension,
  findCoverFileName,
  isAnimatedImage
} from '../../library/cover-files'
import type { ManualGamesFile, SavedManualGame } from './manual-games-file'
import type { SteamTitleSearch } from './steam-title-search'

// Covers for manual games (docs/features/library-tools.md, "Manual game
// covers"): the exe's icon for every game, and a Steam poster for games set
// to "Steam cover" whose title matches a Steam game exactly. Files live in
// covers-manual/ as `<id>-poster.<ext>` and `<id>-icon.png`, so the two never
// replace each other.
//
// Every file is read or looked up at most once per app session (per exe for
// icons, per title for posters), whatever else fails. That is what keeps
// "new files → windows read the list → the list starts a sync" from ever
// becoming a loop.

export interface CoverFileInfo {
  name: string
  // Goes into the URL, so a replaced file gets a new URL and the window
  // never shows a cached old image.
  mtimeMs: number
}

export interface ManualCoverDeps {
  file: ManualGamesFile
  search: (title: string) => Promise<SteamTitleSearch>
  // The poster URL for a Steam app: null when Steam has none, 'failed' when
  // Steam couldn't be asked.
  posterUrlFor: (appId: string) => Promise<string | null | 'failed'>
  // Rejects on any download problem.
  downloadPoster: (url: string) => Promise<Uint8Array>
  exeExists: (exePath: string) => Promise<boolean>
  // PNG bytes of the exe's icon, or null when Windows gives none.
  readIcon: (exePath: string) => Promise<Uint8Array | null>
  listFiles: () => Promise<CoverFileInfo[]>
  writeFile: (name: string, bytes: Uint8Array) => Promise<void>
  deleteFile: (name: string) => Promise<void>
  // New files on disk: windows read the list again.
  notify: () => void
  // Between two Steam searches, so a long first run doesn't hammer Steam.
  pauseBetweenSearches?: () => Promise<void>
}

export interface ManualCoverUrls {
  posterUrl: string | null
  iconUrl: string | null
}

// What the URLs need to know about a game.
export type CoverGame = Pick<SavedManualGame, 'id' | 'title' | 'steamAppId'>

export interface ManualCovers {
  urls: (games: CoverGame[]) => Promise<Map<string, ManualCoverUrls>>
  // Starts a sync in the background (or another after the running one).
  requestSync: () => void
  // Lets this game's poster be looked up and its icon read again this
  // session (switched back to Steam cover, renamed, or Change .exe).
  retry: (id: string) => void
  // Removed game: both files go.
  forget: (id: string) => Promise<void>
  // Renamed game: its Steam poster was for the old title.
  dropPoster: (id: string) => Promise<void>
  // For tests: resolves when no sync is running.
  whenIdle: () => Promise<void>
}

interface ParsedFile {
  id: string
  kind: 'poster' | 'icon'
}

// Through cover-files' own parser, so what is pruned here and what the cover
// protocol serves can't disagree. Temp files and strays never match.
function parseFileName(name: string): ParsedFile | null {
  const coverId = coverIdFromFileName('manual', name)
  if (coverId === null) return null
  const dash = coverId.lastIndexOf('-')
  const kind = coverId.slice(dash + 1)
  if (kind !== 'poster' && kind !== 'icon') return null
  return { id: coverId.slice(0, dash), kind }
}

// In the same extension order the cover protocol serves, so the URL's
// modified time is always the served file's.
function posterFileOf(id: string, files: CoverFileInfo[]): CoverFileInfo | undefined {
  const name = findCoverFileName(`${id}-poster`, new Set(files.map((file) => file.name)))
  return files.find((file) => file.name === name)
}

function iconFileOf(id: string, files: CoverFileInfo[]): CoverFileInfo | undefined {
  return files.find((file) => file.name === `${id}-icon.png`)
}

function urlOf(
  id: string,
  kind: 'poster' | 'icon',
  file: CoverFileInfo | undefined
): string | null {
  if (file === undefined) return null
  return `${MANUAL_COVER_URL_PREFIX}${id}-${kind}?v=${Math.floor(file.mtimeMs)}`
}

function titleKey(id: string, title: string): string {
  return `${id}\n${title}`
}

export function createManualCovers(deps: ManualCoverDeps): ManualCovers {
  // This session's attempts: icons per exe, posters per title.
  const iconTried = new Set<string>()
  const posterTried = new Set<string>()
  // Posters saved this session, valid even if saving their app id failed
  // (manual-games.json locked): otherwise the next sync would think them
  // stale and delete them.
  const postersWritten = new Set<string>()
  let running: Promise<void> | null = null
  let again = false

  async function listFiles(): Promise<CoverFileInfo[]> {
    try {
      return await deps.listFiles()
    } catch {
      // No folder yet (first run) means no covers.
      return []
    }
  }

  // A poster is the game's only while it carries the app id it was found
  // for (renaming clears it). A leftover file from an old title, or one
  // whose delete failed, is never shown under the new title.
  function hasValidPoster(game: CoverGame, files: CoverFileInfo[]): boolean {
    if (posterFileOf(game.id, files) === undefined) return false
    return game.steamAppId !== undefined || postersWritten.has(titleKey(game.id, game.title))
  }

  // The game as saved right now, for re-checking after a slow step: it may
  // have been removed, renamed, re-pointed or switched to Exe icon meanwhile.
  async function current(id: string): Promise<SavedManualGame | null> {
    const read = await deps.file.read()
    if (!read.readable) return null
    return read.games.find((game) => game.id === id) ?? null
  }

  // Saves what was learned about a game, only if it still matches.
  async function remember(
    id: string,
    stillMatches: (game: SavedManualGame) => boolean,
    fields: Partial<SavedManualGame>
  ): Promise<boolean> {
    const result = await deps.file.update<'stale'>(async (games) => {
      const index = games.findIndex((game) => game.id === id)
      const game = games[index]
      if (game === undefined || !stillMatches(game)) return { failure: 'stale' }
      return { games: games.map((other, i) => (i === index ? { ...other, ...fields } : other)) }
    })
    return result.saved
  }

  async function deleteQuietly(name: string): Promise<boolean> {
    try {
      await deps.deleteFile(name)
      return true
    } catch {
      return false
    }
  }

  async function syncIcon(game: SavedManualGame, files: CoverFileInfo[]): Promise<boolean> {
    const hasIcon = iconFileOf(game.id, files) !== undefined
    if (hasIcon && game.iconFor === game.exePath) return false
    const key = titleKey(game.id, game.exePath)
    if (iconTried.has(key)) return false
    iconTried.add(key)
    // A missing exe (drive asleep, moved) would give Windows' generic icon,
    // saved for good: "no icon this time" instead, tried on the next start.
    if (!(await deps.exeExists(game.exePath))) return false
    let png: Uint8Array | null = null
    try {
      png = await deps.readIcon(game.exePath)
    } catch (err) {
      console.warn('[manual] could not read an exe icon:', err)
    }
    // Checked by its bytes like every cached image.
    if (png === null || detectImageExtension(png) !== 'png') return false
    const now = await current(game.id)
    if (now === null || now.exePath !== game.exePath) return false
    await deps.writeFile(`${game.id}-icon.png`, png)
    await remember(game.id, (saved) => saved.exePath === game.exePath, { iconFor: game.exePath })
    return true
  }

  async function syncPoster(game: SavedManualGame, files: CoverFileInfo[]): Promise<boolean> {
    if (game.coverSource !== 'steam' || hasValidPoster(game, files)) return false
    if (game.coverMissTitle === game.title) return false
    const key = titleKey(game.id, game.title)
    if (posterTried.has(key)) return false
    posterTried.add(key)

    // Just before the title leaves this PC: still this title, still Steam
    // cover (an Exe icon game never sends its title anywhere).
    const stillWanted = (saved: SavedManualGame | null): saved is SavedManualGame =>
      saved !== null && saved.coverSource === 'steam' && saved.title === game.title
    if (!stillWanted(await current(game.id))) return false

    const search = await deps.search(game.title)
    if (search.kind === 'failed') return false
    if (search.kind === 'miss') {
      await remember(game.id, (saved) => saved.title === game.title, {
        coverMissTitle: game.title
      })
      return false
    }
    const url = await deps.posterUrlFor(search.appId)
    if (url === 'failed') return false
    if (url === null) {
      // On Steam, but without a poster: same as no match.
      await remember(game.id, (saved) => saved.title === game.title, {
        coverMissTitle: game.title
      })
      return false
    }
    let bytes: Uint8Array
    try {
      bytes = await deps.downloadPoster(url)
    } catch (err) {
      console.warn('[manual] could not download a Steam poster:', err)
      return false
    }
    const extension = detectImageExtension(bytes)
    // Not an image (an error page), or animated: never saved.
    if (extension === null || isAnimatedImage(bytes)) return false
    if (!stillWanted(await current(game.id))) return false

    const name = `${game.id}-poster.${extension}`
    await deps.writeFile(name, bytes)
    postersWritten.add(key)
    // An older poster in another format would be served first.
    for (const file of files) {
      const parsed = parseFileName(file.name)
      if (parsed?.id === game.id && parsed.kind === 'poster' && file.name !== name) {
        await deleteQuietly(file.name)
      }
    }
    const kept = await remember(game.id, (saved) => saved.title === game.title, {
      steamAppId: search.appId
    })
    if (!kept && !stillWanted(await current(game.id))) {
      // Renamed or switched while saving: the poster isn't this game's now.
      postersWritten.delete(key)
      await deleteQuietly(name)
      return false
    }
    return true
  }

  async function syncOnce(): Promise<void> {
    const read = await deps.file.read()
    // Nothing is cleaned up or looked up from a list that couldn't be read.
    if (!read.readable) return
    let files = await listFiles()
    let changed = false

    // Files of games that are gone (a crash between Remove and its cleanup).
    // Not when the list is empty: a missing or briefly vanished file reads as
    // "no games", and must not wipe every saved cover.
    if (read.games.length > 0) {
      const ids = new Set(read.games.map((game) => game.id))
      for (const file of files) {
        const parsed = parseFileName(file.name)
        if (parsed !== null && !ids.has(parsed.id) && (await deleteQuietly(file.name))) {
          changed = true
        }
      }
    }
    // Posters that are no longer the game's (renamed; a delete that failed).
    for (const game of read.games) {
      const poster = posterFileOf(game.id, files)
      if (
        poster !== undefined &&
        !hasValidPoster(game, files) &&
        (await deleteQuietly(poster.name))
      ) {
        changed = true
      }
    }
    if (changed) files = await listFiles()

    // Icons first: they are local and quick, so they show at once.
    for (const game of read.games) {
      try {
        if (await syncIcon(game, files)) changed = true
      } catch (err) {
        console.warn('[manual] could not save an exe icon:', err)
      }
    }
    if (changed) deps.notify()

    // Then posters, each shown as soon as it is saved.
    let searched = false
    for (const game of read.games) {
      try {
        const wantsSearch =
          game.coverSource === 'steam' &&
          !hasValidPoster(game, files) &&
          game.coverMissTitle !== game.title &&
          !posterTried.has(titleKey(game.id, game.title))
        if (wantsSearch && searched) await deps.pauseBetweenSearches?.()
        if (wantsSearch) searched = true
        if (await syncPoster(game, files)) deps.notify()
      } catch (err) {
        // One game's trouble (a file it couldn't write) doesn't stop the rest.
        console.warn('[manual] could not update a game’s poster:', err)
      }
    }
  }

  function requestSync(): void {
    if (running !== null) {
      again = true
      return
    }
    running = (async () => {
      do {
        again = false
        try {
          await syncOnce()
        } catch (err) {
          console.warn('[manual] cover sync failed:', err)
        }
      } while (again)
    })().finally(() => {
      running = null
    })
  }

  async function deleteWhere(id: string, kinds: ParsedFile['kind'][]): Promise<void> {
    for (const file of await listFiles()) {
      const parsed = parseFileName(file.name)
      if (parsed?.id === id && kinds.includes(parsed.kind)) await deleteQuietly(file.name)
    }
  }

  return {
    urls: async (games) => {
      const files = await listFiles()
      const result = new Map<string, ManualCoverUrls>()
      for (const game of games) {
        if (!MANUAL_ID_PATTERN.test(game.id)) continue
        result.set(game.id, {
          posterUrl: hasValidPoster(game, files)
            ? urlOf(game.id, 'poster', posterFileOf(game.id, files))
            : null,
          iconUrl: urlOf(game.id, 'icon', iconFileOf(game.id, files))
        })
      }
      return result
    },
    requestSync,
    retry: (id) => {
      const prefix = `${id}\n`
      for (const key of posterTried) if (key.startsWith(prefix)) posterTried.delete(key)
      for (const key of postersWritten) if (key.startsWith(prefix)) postersWritten.delete(key)
      // And its icon: after Change .exe back to an earlier exe, that one's
      // icon is read again instead of the last exe's staying.
      for (const key of iconTried) if (key.startsWith(prefix)) iconTried.delete(key)
    },
    forget: (id) => deleteWhere(id, ['poster', 'icon']),
    dropPoster: (id) => deleteWhere(id, ['poster']),
    whenIdle: async () => {
      while (running !== null) await running
    }
  }
}
