// Channel names and plain types only — no validation library import. This
// file is safe to pull into the sandboxed preload bundle. A sandboxed
// preload can only `require()` a small Electron built-in allowlist, so any
// npm dependency (zod included) reaching it via an import chain crashes the
// preload silently and leaves `window.api` undefined. Zod schemas that
// derive from these types live in steam.ts, imported by main only.
export const STEAM_CHANNELS = {
  getInstalledGames: 'steam:getInstalledGames',
  launch: 'steam:launch',
  signIn: 'steam:signIn',
  cancelSignIn: 'steam:cancelSignIn',
  disconnect: 'steam:disconnect',
  getConnectionStatus: 'steam:getConnectionStatus',
  setApiKey: 'steam:setApiKey',
  clearApiKey: 'steam:clearApiKey',
  getOwnedGames: 'steam:getOwnedGames',
  getCachedLibrary: 'steam:getCachedLibrary'
} as const

export interface SteamInstalledGame {
  appId: string
  title: string
  installPath: string
}

export interface SteamOwnedGame {
  appId: string
  title: string
  // null when no cover art was found for this app.
  coverUrl: string | null
}

// Why a live refresh of the library didn't happen. Main decides this from the
// failure it saw; the renderer only maps it to wording.
//  - offline: Steam couldn't be reached at all (no connection, DNS failure)
//  - keyRejected: Steam answered 401/403, i.e. it did not accept the API key
//  - unavailable: anything else (Steam erroring, rate limits, timeouts)
export type SteamLibraryProblem = 'offline' | 'keyRejected' | 'unavailable'

// `source: 'cache'` means the games are the saved copy because the live
// refresh failed; `problem` says why. For `source: 'live'`, problem is null.
export type SteamLibraryResult =
  | { source: 'live'; games: SteamOwnedGame[]; problem: null }
  | { source: 'cache'; games: SteamOwnedGame[]; problem: SteamLibraryProblem }

// The steamId64 is set by main from the same connection read that picked the
// cache entry, so the renderer never has to guess which account a list
// belongs to (it could otherwise mislabel it if the account changed while
// the request was in flight).
export interface SteamCachedLibrary {
  steamId64: string
  games: SteamOwnedGame[]
}

export interface SteamLaunchRequest {
  appId: string
}

// A discriminated union instead of independent fields: makes
// {status: 'connected', steamId64: null} unrepresentable rather than just
// "shouldn't happen".
export type SteamConnectionStatus =
  | { status: 'connected'; steamId64: string; hasApiKey: boolean }
  | { status: 'disconnected'; steamId64: null; hasApiKey: boolean }
