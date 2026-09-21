import { COVER_URL_PREFIX, type SteamOwnedGame } from '@shared/ipc/steam-channels'

// Pure view helpers for the library, kept out of App.tsx so they can be unit
// tested (the renderer has no component test setup).

// Takes the cover URLs from `fresh` (the library as main now returns it, with
// local app-cover:// URLs for covers that have finished downloading) and
// applies them to `games` (what is on screen).
//
// Only ever an UPGRADE to a local copy. `fresh` comes from a separate request
// than what is shown, so it can be a snapshot from before the shown list was
// built; taking a remote or missing URL from it would put an older, worse
// answer over a newer one (a cover that is local now would go back to remote
// and show a placeholder offline). Titles and order stay as shown, and a game
// that isn't in `fresh` is left alone. Returns the same array when nothing
// changed, so React can skip re-rendering.
export function applyFreshCovers(
  games: SteamOwnedGame[],
  fresh: SteamOwnedGame[]
): SteamOwnedGame[] {
  const coverByAppId = new Map(fresh.map((game) => [game.appId, game.coverUrl]))
  let changed = false
  const updated = games.map((game) => {
    const coverUrl = coverByAppId.get(game.appId)
    if (coverUrl == null || !coverUrl.startsWith(COVER_URL_PREFIX) || coverUrl === game.coverUrl) {
      return game
    }
    changed = true
    return { ...game, coverUrl }
  })
  return changed ? updated : games
}

// The parts of a result that mergeFreshCovers needs; anything else on it
// (error, problem, failure count, ...) is carried through untouched.
interface ShownLibrary {
  steamId64: string
  games: SteamOwnedGame[] | null
}

// Folds a freshly re-read library into what is shown. `fresh.steamId64` is set
// by main, so a list for a different account than the one on screen is ignored
// rather than mixed in. Returns `previous` itself (same reference) whenever
// there is nothing to change, so the state update is a no-op.
export function mergeFreshCovers<T extends ShownLibrary>(
  previous: T | null,
  fresh: { steamId64: string; games: SteamOwnedGame[] }
): T | null {
  if (previous === null || previous.steamId64 !== fresh.steamId64 || previous.games === null) {
    return previous
  }
  const games = applyFreshCovers(previous.games, fresh.games)
  return games === previous.games ? previous : { ...previous, games }
}
