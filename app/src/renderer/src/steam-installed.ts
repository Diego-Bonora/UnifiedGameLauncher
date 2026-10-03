import type { SteamInstalledGame, SteamInstalledResult } from '@shared/ipc/steam-channels'

// Pure logic, kept out of the hook so it can be unit tested (the renderer has
// no component test setup).

// What an installed-games read should leave on screen.
//
// A library folder main couldn't read (a sleeping or unplugged drive) is not
// a folder with no games: the games last seen there keep showing as
// installed, or they would drop to Library and offer to install a game that
// is already on the PC. Every folder that WAS read is taken as it is, so new
// installs and uninstalls there still show up while another drive sleeps.
// When main couldn't even read the list of folders, every game last seen
// stays.
//
// The list lives only in memory, so this can't help on the first read after
// startup (a known limit in docs/features/library-layout.md). The flip side:
// if Steam was uninstalled but left its registry key, every read is
// "unreadable" and the old games stay until the app restarts.
//
// A failed call ('failed') keeps everything, and a failed FIRST read shows
// nothing rather than an error.
//
// Covers only ever upgrade (lessons.md: never let a view downgrade): a game
// that showed a cover keeps it when a later read comes back without one, for
// example while the covers folder is briefly locked.
export function nextSteamInstalled(
  previous: SteamInstalledGame[] | null,
  read: SteamInstalledResult | 'failed'
): SteamInstalledGame[] {
  if (read === 'failed') return previous ?? []
  if (previous === null || previous.length === 0) return read.games

  const shownCovers = new Map(
    previous.flatMap((game) =>
      game.coverUrl === null ? [] : [[game.appId, game.coverUrl] as const]
    )
  )
  const fresh = read.games.map((game) =>
    game.coverUrl === null && shownCovers.has(game.appId)
      ? { ...game, coverUrl: shownCovers.get(game.appId) ?? null }
      : game
  )

  const unreadable = new Set(read.unreadableLibraries)
  const seen = new Set(read.games.map((game) => game.appId))
  const kept = previous.filter(
    (game) =>
      !seen.has(game.appId) && (!read.libraryListReadable || unreadable.has(game.libraryPath))
  )
  return kept.length === 0 ? fresh : [...fresh, ...kept]
}
