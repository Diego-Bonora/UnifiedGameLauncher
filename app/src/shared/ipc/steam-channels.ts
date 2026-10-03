// Channel names and plain types only — no validation library import. This
// file is safe to pull into the sandboxed preload bundle. A sandboxed
// preload can only `require()` a small Electron built-in allowlist, so any
// npm dependency (zod included) reaching it via an import chain crashes the
// preload silently and leaves `window.api` undefined. Zod schemas that
// derive from these types live in steam.ts, imported by main only.
export const STEAM_CHANNELS = {
  getInstalledGames: 'steam:getInstalledGames',
  launch: 'steam:launch',
  install: 'steam:install',
  signIn: 'steam:signIn',
  cancelSignIn: 'steam:cancelSignIn',
  disconnect: 'steam:disconnect',
  getConnectionStatus: 'steam:getConnectionStatus',
  setApiKey: 'steam:setApiKey',
  clearApiKey: 'steam:clearApiKey',
  getOwnedGames: 'steam:getOwnedGames',
  getCachedLibrary: 'steam:getCachedLibrary',
  // Main -> renderer notice (no payload) that covers finished downloading.
  coversChanged: 'steam:coversChanged'
} as const

// What a cover URL starts with when it points at a copy saved on disk (served
// by main's app-cover:// handler). Main builds these; the renderer only checks
// the prefix, so the two can't drift apart.
export const COVER_URL_PREFIX = 'app-cover://covers/'

export interface SteamInstalledGame {
  appId: string
  title: string
  installPath: string
  // The Steam library folder the game was found in, normalized by main (lower
  // case, backslashes, no trailing slash) the same way as
  // `unreadableLibraries` below, so the two compare as plain strings, also
  // across reads. Not for display.
  libraryPath: string
}

// One read of the games installed on this PC. A library folder that couldn't
// be read is not the same as one with no games: a sleeping or unplugged drive
// would otherwise make every game on it look uninstalled. So the result says
// what it couldn't see, and the renderer keeps the games it last saw there.
//  - unreadableLibraries: library folders Steam lists that couldn't be read
//  - libraryListReadable: false when Steam's list of library folders itself
//    couldn't be read, so any library other than the main one may be missing
//    without being named in unreadableLibraries
export interface SteamInstalledResult {
  games: SteamInstalledGame[]
  unreadableLibraries: string[]
  libraryListReadable: boolean
}

export interface SteamOwnedGame {
  appId: string
  title: string
  // null when no cover art was found for this app.
  coverUrl: string | null
}

// Why a live refresh of the library failed. Main decides this from the
// failure it saw; the renderer only maps it to wording.
//  - offline: Steam couldn't be reached at all (no connection, DNS failure)
//  - keyRejected: Steam answered 401/403. Usually a wrong key, but a firewall
//    block on a good key answers the same way, so wording must say "may be"
//  - unavailable: anything else (Steam erroring, rate limits, timeouts)
export type SteamLibraryFailure = 'offline' | 'keyRejected' | 'unavailable'

// A failure, or Steam answering successfully with an EMPTY library while a
// non-empty saved copy exists (a private profile or a bad response looks the
// same; a real library never shrinks to nothing).
export type SteamLibraryProblem = SteamLibraryFailure | 'empty'

// Expected failures come back as data, not as a thrown error: a rejected
// ipcRenderer.invoke carries Electron's "Error invoking remote method ..."
// prefix, which would reach the user. The renderer owns all the wording.
//  - live:  fresh from Steam
//  - cache: the saved copy, because the live refresh failed; `problem` says why
//  - none:  the refresh failed and nothing is saved, so there is nothing to show
export type SteamLibraryResult =
  | { source: 'live'; games: SteamOwnedGame[]; problem: null }
  | { source: 'cache'; games: SteamOwnedGame[]; problem: SteamLibraryProblem }
  | { source: 'none'; games: null; problem: SteamLibraryFailure }

// The steamId64 is set by main from the same connection read that picked the
// cache entry, so the renderer never has to guess which account a list
// belongs to (it could otherwise mislabel it if the account changed while
// the request was in flight).
export interface SteamCachedLibrary {
  steamId64: string
  games: SteamOwnedGame[]
}

// The payload for both launch and install.
export interface SteamAppRequest {
  appId: string
}

// Whether a launch or install request reached Steam. Returned as data, never
// thrown (Electron would prefix a thrown message). "Accepted" only means
// Windows handed the URL to Steam: the game window or install dialog comes
// later, which is why the renderer pauses the cards for a few seconds.
//  - steamUnavailable: Windows couldn't hand the request to Steam (Steam not
//    installed, or its steam:// registration is broken)
export type SteamHandOffResult =
  { accepted: true } | { accepted: false; reason: 'steamUnavailable' }

// A discriminated union instead of independent fields: makes
// {status: 'connected', steamId64: null} unrepresentable rather than just
// "shouldn't happen".
export type SteamConnectionStatus =
  | { status: 'connected'; steamId64: string; hasApiKey: boolean }
  | { status: 'disconnected'; steamId64: null; hasApiKey: boolean }
