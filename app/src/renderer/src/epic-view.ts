import type { EpicInstalledGame, EpicLaunchResult } from '@shared/ipc/epic-channels'
import { epicLaunchMessage } from './epic-launch-messages'

// Pure logic for the Epic section, kept out of the component so it can be unit
// tested (the renderer has no component test setup), like library-view.ts.

// Folder order is arbitrary, so the list is sorted for display. Returns a new
// array; never reorders the one it was given.
export function sortEpicGames(games: EpicInstalledGame[]): EpicInstalledGame[] {
  return [...games].sort((a, b) => a.title.localeCompare(b.title))
}

// What a list read should leave on screen. A failed FIRST read is shown as
// "nothing found" (never a raw error); a failed REFRESH keeps the list that
// was already there, because a hiccup on window focus must not make the user's
// games look like they vanished.
//
// Covers only ever upgrade: a game that already shows a cover keeps it when a
// later read comes back without one (the covers folder briefly locked, say).
// A local cover is only removed once its game has been gone for 30 days, and
// by then the game isn't in the list either (lessons.md: never let a view
// downgrade).
export function nextEpicGames(
  previous: EpicInstalledGame[] | null,
  read: EpicInstalledGame[] | 'failed'
): EpicInstalledGame[] {
  if (read === 'failed') return previous ?? []
  const shownCovers = new Map(
    (previous ?? []).flatMap((game) =>
      game.coverUrl === null ? [] : [[game.appName, game.coverUrl] as const]
    )
  )
  return sortEpicGames(
    read.map((game) =>
      game.coverUrl === null && shownCovers.has(game.appName)
        ? { ...game, coverUrl: shownCovers.get(game.appName) ?? null }
        : game
    )
  )
}

export type LaunchOutcome = EpicLaunchResult | 'failed'

export interface LaunchFeedback {
  message: string
  // 'info' is progress ("Starting..."), 'danger' is something to act on.
  tone: 'info' | 'danger'
  // The list was out of date, so it should be read again.
  refreshList: boolean
}

// Turns what the launch call returned into what the user is told. A successful
// hand-off still gets a message: the game window can take a while to appear,
// and with no sign of progress the natural reaction is to click again.
export function feedbackForLaunch(title: string, outcome: LaunchOutcome): LaunchFeedback {
  if (outcome === 'failed') {
    return { message: epicLaunchMessage('failed'), tone: 'danger', refreshList: false }
  }
  if (outcome.accepted) {
    return { message: `Starting ${title}…`, tone: 'info', refreshList: false }
  }
  return {
    message: epicLaunchMessage(outcome.reason),
    tone: 'danger',
    refreshList: outcome.reason === 'notInstalled'
  }
}
