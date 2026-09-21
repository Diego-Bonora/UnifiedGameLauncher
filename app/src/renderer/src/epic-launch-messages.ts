import type { EpicLaunchFailure } from '@shared/ipc/epic-channels'

// Kept out of the component as a plain function so the wording can be unit
// tested (the renderer has no component test setup), and so this is the only
// place that words an Epic launch problem. Never raw error text; each message
// says what happened and what to do next.

// 'failed' is for the launch call itself breaking, which main never intends:
// it returns expected problems as data.
export type EpicLaunchProblem = EpicLaunchFailure | 'failed'

export function epicLaunchMessage(problem: EpicLaunchProblem): string {
  switch (problem) {
    case 'notInstalled':
      return "This game doesn't seem to be installed any more, so your list is being refreshed."
    case 'launcherUnavailable':
      return "Could not open the Epic Games launcher. Make sure it's installed, then try again."
    case 'failed':
      return 'Could not launch this game. Please try again.'
  }
}
