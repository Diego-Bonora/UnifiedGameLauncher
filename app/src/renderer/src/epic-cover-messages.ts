import type { EpicCoverStatus } from '@shared/ipc/epic-channels'

// The only place the Epic cover status and key form are worded, as plain
// functions so the wording can be unit tested (the renderer has no component
// test setup). Never raw error text; each line says what to do next.

export interface CoverStatusLine {
  text: string
  // 'danger' needs the user (a key to fix); 'muted' is information.
  tone: 'muted' | 'danger'
}

export function coverStatusLine(status: EpicCoverStatus): CoverStatusLine {
  if (!status.hasKey) {
    return {
      text: 'Add a free SteamGridDB key to show cover art for your Epic games.',
      tone: 'muted'
    }
  }
  switch (status.problem) {
    case 'keyRejected':
      return {
        text: "SteamGridDB didn't accept your key. Check it, or remove it.",
        tone: 'danger'
      }
    case 'unavailable':
      return {
        text: "Can't reach SteamGridDB right now. Covers you already have still show; new ones will follow later.",
        tone: 'muted'
      }
    case null:
      return { text: 'Epic covers come from SteamGridDB.', tone: 'muted' }
  }
}

// The full form shows only when there's something to do: no key yet, or a
// key that was rejected. A working key collapses to one quiet line.
export function shouldShowKeyForm(status: EpicCoverStatus): boolean {
  return !status.hasKey || status.problem === 'keyRejected'
}

// 'failed' is the call itself breaking, which main never intends: it returns
// expected problems as data.
export type CoverKeyProblem = 'invalidKey' | 'cannotStore' | 'removeFailed' | 'failed'

export function coverKeyMessage(problem: CoverKeyProblem): string {
  switch (problem) {
    case 'invalidKey':
      return "That doesn't look like a SteamGridDB key. It should be 32 letters and numbers."
    case 'cannotStore':
      return "This computer can't store the key securely right now. Please try again."
    case 'removeFailed':
      return 'Could not remove the key. Please try again.'
    case 'failed':
      return 'Something went wrong. Please try again.'
  }
}
