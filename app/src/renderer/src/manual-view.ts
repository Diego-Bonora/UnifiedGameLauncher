import type { ManualGamesList } from '@shared/ipc/manual-channels'

// Pure logic for the manual games list, kept out of the hook so it can be unit
// tested (the renderer has no component test setup), like epic-view.ts.

// What a list answer from main should leave on screen. Covers never blank
// because of a hiccup (lessons.md: never let a view downgrade): when main says
// it couldn't list the covers folder (`coversReadable: false`, every URL null
// for that reason alone), each game keeps the poster and icon it shows.
// Otherwise main's answer is the truth, including a cover it removed on
// purpose (a rename, a poster found for an old title, a re-read icon).
//
// Even while the folder can't be listed, a renamed game drops its poster: it
// was found for the old title (docs/features/library-tools.md, "Manual game
// covers").
//
// Returns `next` itself when nothing had to be kept.
export function nextManualList(previous: ManualGamesList, next: ManualGamesList): ManualGamesList {
  if (next.coversReadable) return next
  const shown = new Map(previous.games.map((game) => [game.id, game]))
  let kept = false
  const games = next.games.map((game) => {
    const before = shown.get(game.id)
    if (before === undefined) return game
    const posterUrl = game.posterUrl ?? (before.title === game.title ? before.posterUrl : null)
    const iconUrl = game.iconUrl ?? before.iconUrl
    if (posterUrl === game.posterUrl && iconUrl === game.iconUrl) return game
    kept = true
    return { ...game, posterUrl, iconUrl }
  })
  return kept ? { ...next, games } : next
}
