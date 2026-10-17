// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). The zod checks live in updates.ts, which
// only main imports. Spec: docs/features/release.md, section 4.
export const UPDATES_CHANNELS = {
  getStatus: 'updates:getStatus',
  checkNow: 'updates:checkNow',
  download: 'updates:download',
  restartAndInstall: 'updates:restartAndInstall',
  setEnabled: 'updates:setEnabled',
  // main → window, no payload: the status changed, read it with getStatus.
  statusChanged: 'updates:statusChanged'
} as const

// The one updater state, kept in main; the window only shows it.
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  // `manual`: the user pressed Check now (or joined a running check with it),
  // so the failure gets a message. An automatic one only shows in Settings.
  | { kind: 'checkFailed'; manual: boolean }
  | { kind: 'downloadFailed'; version: string }

export interface UpdateStatus {
  state: UpdateState
  // The running app's version, for "You're up to date (version X)".
  currentVersion: string
  // The "Check for updates automatically" switch as main applies it.
  enabled: boolean
  // settings.json exists but couldn't be read: updates are off for this run
  // until the user flips the switch, which writes a fresh file.
  settingsUnreadable: boolean
  // An unpackaged (development) build never checks.
  devBuild: boolean
  // electron-updater couldn't start in this copy, so it never checks.
  updaterUnavailable: boolean
}

// `accepted: false` when main's own state didn't allow the action (for
// example Download with nothing available); the window then shows `status`.
export interface UpdateActionResult {
  accepted: boolean
  status: UpdateStatus
}

// `saved: false` when settings.json couldn't be written; `status.enabled` is
// then what main still uses.
export interface UpdateSetEnabledResult {
  saved: boolean
  status: UpdateStatus
}
