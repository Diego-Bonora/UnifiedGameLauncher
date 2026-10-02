// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). The zod schemas live in epic.ts, which
// only main imports.
export const EPIC_CHANNELS = {
  getInstalledGames: 'epic:getInstalledGames',
  launch: 'epic:launch',
  getCoverStatus: 'epic:getCoverStatus',
  setCoverKey: 'epic:setCoverKey',
  clearCoverKey: 'epic:clearCoverKey',
  // main -> renderer event: new covers are on disk, or the cover status
  // changed. No payload; the window re-reads both.
  coversChanged: 'epic:coversChanged'
} as const

// Covers are only ever shown from the local cache through this scheme; the
// renderer never loads SteamGridDB URLs directly.
export const EPIC_COVER_URL_PREFIX = 'app-cover://epic/'

export interface EpicInstalledGame {
  // Epic's own id for the game (the manifest's AppName).
  appName: string
  title: string
  installPath: string
  // A cached SteamGridDB poster (EPIC_COVER_URL_PREFIX + appName), or null
  // to show the title on a placeholder.
  coverUrl: string | null
}

export interface EpicLaunchRequest {
  appName: string
}

// Expected failures come back as data rather than a thrown error, which
// Electron would prefix with "Error invoking remote method". The renderer
// owns the wording.
//  - notInstalled: the game was uninstalled since the list was read
//  - launcherUnavailable: Windows couldn't hand the request to the Epic
//    launcher (not installed, or its protocol registration is broken)
export type EpicLaunchFailure = 'notInstalled' | 'launcherUnavailable'
export type EpicLaunchResult = { launched: true } | { launched: false; reason: EpicLaunchFailure }

// SteamGridDB key status for the Epic section. The key itself never crosses
// to the renderer.
//  - keyRejected: SteamGridDB said the key is not valid
//  - unavailable: offline, SteamGridDB having trouble, or the cover records
//    couldn't be read; covers already saved keep showing
export type EpicCoverProblem = 'keyRejected' | 'unavailable'

export interface EpicCoverStatus {
  hasKey: boolean
  problem: EpicCoverProblem | null
}

export interface EpicCoverKeyRequest {
  apiKey: string
}

// Returned as data, never thrown (Electron would prefix a thrown message).
//  - invalidKey: not the shape of a SteamGridDB key (32 hex characters)
//  - cannotStore: this PC can't encrypt or save secrets right now
export type EpicSetCoverKeyResult =
  { saved: true; status: EpicCoverStatus } | { saved: false; reason: 'invalidKey' | 'cannotStore' }

export type EpicClearCoverKeyResult = { cleared: boolean; status: EpicCoverStatus }
