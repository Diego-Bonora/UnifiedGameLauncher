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
export function nextEpicGames(
  previous: EpicInstalledGame[] | null,
  read: EpicInstalledGame[] | 'failed'
): EpicInstalledGame[] {
  if (read === 'failed') return previous ?? []
  return sortEpicGames(read)
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
  if (outcome.launched) {
    return { message: `Starting ${title}…`, tone: 'info', refreshList: false }
  }
  return {
    message: epicLaunchMessage(outcome.reason),
    tone: 'danger',
    refreshList: outcome.reason === 'notInstalled'
  }
}
