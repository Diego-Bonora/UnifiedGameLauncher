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
  getConnectionStatus: 'steam:getConnectionStatus'
} as const

export interface SteamInstalledGame {
  appId: string
  title: string
  installPath: string
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
