import type { SteamLibraryProblem } from '@shared/ipc/steam-channels'

// Kept out of App.tsx as plain functions so the wording and the retry timing
// can be unit tested (the renderer has no component test setup), and so the
// only place that words a library problem is this one.

export type NoticeTone = 'pill' | 'muted' | 'danger'

export interface LibraryNotice {
  tone: NoticeTone
  text: string
}

// `hasSavedCopy` is whether a library is on screen: the same problem reads
// differently as a note on top of a saved library than as the only thing shown.
// Never raw error text; each message says what happened and, where there is
// something to do, what to do next.
export function libraryNotice(problem: SteamLibraryProblem, hasSavedCopy: boolean): LibraryNotice {
  switch (problem) {
    case 'offline':
      return hasSavedCopy
        ? { tone: 'pill', text: 'Offline — showing saved library' }
        : {
            tone: 'muted',
            text: "You're offline, so your Steam library couldn't be loaded. It will load once you're back online."
          }
    case 'keyRejected':
      // "may be": Steam's own bad-key answer and a firewall block on a good key
      // look identical from here (see problemForStatus in main).
      return {
        tone: 'danger',
        text: hasSavedCopy
          ? 'Steam turned down the request, so this is your saved library. Your Web API key may be wrong: check it above, or remove it and add it again.'
          : 'Steam turned down the request. Your Web API key may be wrong: check it above, or remove it and add it again.'
      }
    case 'unavailable':
      return hasSavedCopy
        ? {
            tone: 'muted',
            text: "Steam isn't responding right now, so this is your saved library."
          }
        : { tone: 'danger', text: 'Could not load your Steam library. Please try again later.' }
    case 'empty':
      return {
        tone: 'muted',
        text: hasSavedCopy
          ? "Steam returned an empty library, so this is your saved library. Your profile's game details might be set to private."
          : "Steam returned an empty library. Your profile's game details might be set to private."
      }
  }
}

// The browser's `online` event often fires before the connection is really
// usable, and it doesn't fire at all behind some VPNs. So the app also retries
// on its own while a problem is showing, backing off so a long outage doesn't
// hammer Steam: 5 s, 15 s, then once a minute.
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const

export function retryDelayMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1
  return RETRY_DELAYS_MS[index] ?? 60_000
}

// Wait a moment after the browser says it is online: right after the link
// comes up the first request usually still fails, and flapping connections fire
// the event repeatedly.
export const ONLINE_DEBOUNCE_MS = 1_000
