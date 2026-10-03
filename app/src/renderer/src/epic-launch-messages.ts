import type { EpicLaunchFailure } from '@shared/ipc/epic-channels'

// The wording for the problems Epic's launch reports, used by hand-off.ts
// (which words every launch and install result, and the call itself breaking).
// A plain function so it can be unit tested. Never raw error text; each
// message says what happened and what to do next.
export function epicLaunchMessage(problem: EpicLaunchFailure): string {
  switch (problem) {
    case 'notInstalled':
      return "This game doesn't seem to be installed any more, so your list is being refreshed."
    case 'launcherUnavailable':
      return "Could not open the Epic Games launcher. Make sure it's installed, then try again."
  }
}
