import type { UpdateStatus } from '@shared/ipc/updates-channels'

// Everything the window says about updates (docs/features/release.md,
// section 4, "What the user sees" and "Problems"), worked out from main's
// status alone so it can be tested without React.

export const CHECK_NOW_FAILED =
  "Couldn't check for updates. Check your internet connection and try again."
export const AUTOMATIC_CHECK_FAILED = "Couldn't check for updates last time."
export const DOWNLOAD_FAILED = "The update couldn't be downloaded. Try again later."
export const SETTINGS_UNREADABLE =
  "Couldn't read your settings. Updates are off until you turn them on again."
export const DEV_BUILD = 'Updates are off in development builds.'
export const UPDATER_UNAVAILABLE = "Updates aren't available in this copy."
export const SWITCH_NOT_SAVED = "Couldn't save your choice. Try again."

export type SidebarNotice =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'downloadFailed'; version: string }

// The notice at the bottom of the sidebar, or null for none. `laterVersion`
// is the version the user pressed Later on: its offer stays hidden until the
// app restarts. A download or a finished one always shows, since the user
// asked for it.
export function sidebarNotice(
  status: UpdateStatus | null,
  laterVersion: string | null
): SidebarNotice | null {
  if (status === null) return null
  const { state } = status
  switch (state.kind) {
    case 'available':
    case 'downloadFailed':
      return state.version === laterVersion ? null : { kind: state.kind, version: state.version }
    case 'downloading':
      return { kind: 'downloading', version: state.version, percent: state.percent }
    case 'ready':
      return { kind: 'ready', version: state.version }
    default:
      // Checking, up to date and a failed check show nothing in the sidebar.
      return null
  }
}

export interface SettingsLine {
  text: string
  tone: 'muted' | 'danger'
}

// The one line in Settings that says where updates stand.
export function settingsLine(status: UpdateStatus): SettingsLine {
  if (status.devBuild) return { text: DEV_BUILD, tone: 'muted' }
  if (status.updaterUnavailable) return { text: UPDATER_UNAVAILABLE, tone: 'muted' }
  const { state } = status
  switch (state.kind) {
    case 'checking':
      return { text: 'Checking for updates…', tone: 'muted' }
    case 'upToDate':
      return { text: `You're up to date (version ${status.currentVersion}).`, tone: 'muted' }
    case 'available':
      return { text: `Version ${state.version} is available.`, tone: 'muted' }
    case 'downloading':
      // The percent is shown by the progress bar beside it, so this text
      // doesn't change (and isn't re-announced) every percent.
      return { text: `Downloading version ${state.version}…`, tone: 'muted' }
    case 'ready':
      return { text: 'Ready to install: restart the app.', tone: 'muted' }
    case 'checkFailed':
      return state.manual
        ? { text: CHECK_NOW_FAILED, tone: 'danger' }
        : { text: AUTOMATIC_CHECK_FAILED, tone: 'muted' }
    case 'downloadFailed':
      return { text: DOWNLOAD_FAILED, tone: 'danger' }
    case 'idle':
      return { text: `Version ${status.currentVersion}.`, tone: 'muted' }
  }
}

export interface SettingsActions {
  checkNow: boolean
  download: boolean
  restart: boolean
}

// Which buttons Settings offers. Only what main would accept, so a click
// never does nothing: no Check now while downloading or once an update is
// ready, nothing at all in a copy that never checks.
export function settingsActions(status: UpdateStatus): SettingsActions {
  const inactive = status.devBuild || status.updaterUnavailable
  const kind = status.state.kind
  return {
    checkNow: !inactive && kind !== 'downloading' && kind !== 'ready',
    download: !inactive && (kind === 'available' || kind === 'downloadFailed'),
    restart: !inactive && kind === 'ready'
  }
}
