import type { EpicLaunchResult } from '@shared/ipc/epic-channels'
import type { ManualLaunchResult } from '@shared/ipc/manual-channels'
import type { SteamHandOffResult } from '@shared/ipc/steam-channels'
import type { StoreId } from '@shared/stores'
import { epicLaunchMessage } from './epic-launch-messages'
import { manualLaunchMessage } from './manual-launch-messages'

// Pure logic for handing a game to its store's launcher, kept out of the hook
// so it can be unit tested. The only place that words a launch or install
// result, for every store.

// Play an installed game, or install one that isn't (Steam only).
export type HandOffKind = 'launch' | 'install'

// What the call returned, or 'failed' when the call itself broke (main never
// intends that: it returns expected problems as data).
export type HandOffOutcome = SteamHandOffResult | EpicLaunchResult | ManualLaunchResult | 'failed'

export interface HandOffFeedback {
  message: string
  // 'info' is progress ("Starting..."), 'danger' is something to act on.
  tone: 'info' | 'danger'
  // The store's installed list was out of date, so it should be read again.
  refreshList: boolean
}

// How long every card stays paused after a store accepts a request. The
// hand-off returns almost at once, but the game window or Steam's install
// dialog can take a while to appear, and a card that looks idle again invites
// a second click and a second launch.
export const HAND_OFF_PAUSE_MS = 5000

function failedMessage(kind: HandOffKind): string {
  return kind === 'launch'
    ? 'Could not launch this game. Please try again.'
    : 'Could not start the install. Please try again.'
}

// A request that reached the launcher still gets a message: with no sign of
// progress the natural reaction is to click again.
export function handOffFeedback(
  game: { store: StoreId; title: string },
  kind: HandOffKind,
  outcome: HandOffOutcome
): HandOffFeedback {
  if (outcome === 'failed') {
    return { message: failedMessage(kind), tone: 'danger', refreshList: false }
  }
  if (outcome.accepted) {
    return {
      message:
        kind === 'launch' ? `Starting ${game.title}…` : `Opening Steam to install ${game.title}…`,
      tone: 'info',
      refreshList: false
    }
  }
  switch (outcome.reason) {
    case 'steamUnavailable':
      return {
        message: "Could not open Steam. Make sure it's installed, then try again.",
        tone: 'danger',
        refreshList: false
      }
    case 'notInstalled':
    case 'launcherUnavailable':
      return {
        message: epicLaunchMessage(outcome.reason),
        tone: 'danger',
        refreshList: outcome.reason === 'notInstalled'
      }
    case 'notFound':
    case 'missing':
    case 'refused':
    case 'unreadable':
    case 'failed':
      return {
        message: manualLaunchMessage(outcome.reason, game.title),
        tone: 'danger',
        // Removed meanwhile: the shown list is out of date.
        refreshList: outcome.reason === 'notFound'
      }
  }
}
