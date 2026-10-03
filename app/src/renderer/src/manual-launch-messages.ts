import type { ManualLaunchFailure } from '@shared/ipc/manual-channels'

// The wording for the problems a manual game's launch reports, used by
// hand-off.ts. Never raw error text; each message says what to do next
// (docs/features/library-tools.md, "Launching").
export function manualLaunchMessage(problem: ManualLaunchFailure, title: string): string {
  switch (problem) {
    case 'notFound':
      return `${title} isn't in your library any more, so your list is being refreshed.`
    case 'missing':
      return `Couldn't find ${title}'s .exe. Use Change .exe to find it again.`
    case 'refused':
      return `Windows wouldn't start ${title}. If it needs to run as administrator, start it once from its folder, or set it to always run as administrator in its Properties.`
    case 'unreadable':
      return `Couldn't read your manual games, so ${title} can't be started right now. Try again in a moment.`
    case 'failed':
      return `Couldn't start ${title}. Check that the game still runs from its folder.`
  }
}
