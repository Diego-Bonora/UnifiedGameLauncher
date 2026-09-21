// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). The zod schemas live in epic.ts, which
// only main imports.
export const EPIC_CHANNELS = {
  getInstalledGames: 'epic:getInstalledGames',
  launch: 'epic:launch'
} as const

export interface EpicInstalledGame {
  // Epic's own id for the game (the manifest's AppName).
  appName: string
  title: string
  installPath: string
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
