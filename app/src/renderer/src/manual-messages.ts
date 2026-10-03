import {
  hasValidArgsCharacters,
  hasValidTitleCharacters,
  MAX_ARGS_LENGTH,
  MAX_TITLE_LENGTH,
  type ManualChangeFailure,
  type ManualPickResult
} from '@shared/ipc/manual-channels'

// All wording for adding and editing manual games
// (docs/features/library-tools.md, "Manual games"), as pure functions so it
// can be unit tested. Never raw error text; each message says what to do.

export interface ManualMessage {
  text: string
  tone: 'info' | 'danger'
}

const UNREADABLE =
  "Couldn't read your manual games, so nothing was changed. Choose Try again next to the notice about it, then retry."
export const BUSY_MESSAGE =
  'Another window from the app is still open, or a change is still being saved. Finish it first, then try again.'

// After the Add game file picker. null: nothing to say (the user closed it,
// or it worked and the form opens).
export function pickMessage(result: ManualPickResult): ManualMessage | null {
  if (result.picked) return null
  switch (result.reason) {
    case 'cancelled':
      return null
    case 'notExe':
      return {
        text: "That file isn't a program. Pick the game's .exe file (not a shortcut or a script).",
        tone: 'danger'
      }
    case 'duplicate':
      return { text: 'That game is already in your library.', tone: 'danger' }
    case 'unreadable':
      return { text: UNREADABLE, tone: 'danger' }
    case 'busy':
      return { text: BUSY_MESSAGE, tone: 'danger' }
  }
}

export type ManualAction = 'add' | 'rename' | 'args' | 'changeExe' | 'remove'

// What the user sees after a change. `stayOpen`: the form stays open with the
// message in it (the user can fix it and save again); otherwise the form (if
// any) closes and the message goes to the app's message line.
export interface ChangeOutcome {
  message: ManualMessage | null
  stayOpen: boolean
}

export function changeSucceeded(action: ManualAction, title: string): ChangeOutcome {
  const text = {
    add: `Added ${title}.`,
    rename: `Renamed to ${title}.`,
    args: `Saved the launch arguments for ${title}.`,
    changeExe: `Updated the .exe for ${title}.`,
    remove: `Removed ${title} from your library. Its files on your PC weren't touched.`
  }[action]
  return { message: { text, tone: 'info' }, stayOpen: false }
}

export function changeFailed(
  action: ManualAction,
  reason: ManualChangeFailure | 'failed',
  title: string
): ChangeOutcome {
  const danger = (text: string, stayOpen = false): ChangeOutcome => ({
    message: { text, tone: 'danger' },
    stayOpen
  })
  switch (reason) {
    case 'notConfirmed':
      // The form stays open: the user can clear the arguments, or save again
      // and choose Save in the confirmation window.
      return danger(
        "The launch arguments weren't saved. Choose Save in the confirmation window, or clear them.",
        true
      )
    case 'cancelled':
      return { message: null, stayOpen: false }
    case 'noPick':
      return danger('That pick has expired. Choose Add game and pick the .exe again.')
    case 'notExe':
      return danger(
        "That file isn't a program. Pick the game's .exe file (not a shortcut or a script)."
      )
    case 'duplicate':
      return danger(
        action === 'changeExe'
          ? 'Another game in your library already uses that .exe.'
          : 'That game is already in your library.'
      )
    case 'notFound':
      return danger(`${title} isn't in your library any more.`)
    case 'unreadable':
      return danger(UNREADABLE)
    case 'busy':
      return danger(BUSY_MESSAGE, action === 'add' || action === 'rename' || action === 'args')
    case 'cannotSave':
      return danger("Couldn't save your manual games. Try again.", action !== 'remove')
    case 'failed':
      return danger('Something went wrong. Try again.', action !== 'remove')
  }
}

// Checked in the form before sending, with the same rules main uses, so the
// user hears what to fix instead of a request main refuses.
export function titleProblem(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed === '') return 'Enter a title.'
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return `Titles can be up to ${MAX_TITLE_LENGTH} characters.`
  }
  if (!hasValidTitleCharacters(trimmed)) {
    return 'The title has hidden or control characters. Type it again without them.'
  }
  return null
}

export function argsProblem(args: string): string | null {
  const trimmed = args.trim()
  if (trimmed.length > MAX_ARGS_LENGTH) {
    return `Launch arguments can be up to ${MAX_ARGS_LENGTH} characters.`
  }
  if (!hasValidArgsCharacters(trimmed)) {
    return 'Launch arguments can only have visible characters: no line breaks or hidden characters.'
  }
  return null
}
