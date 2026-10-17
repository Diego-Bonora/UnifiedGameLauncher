// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). Neither call takes a payload, so main
// only checks that none was sent (ipc/app-handlers.ts).
export const APP_CHANNELS = {
  getVersion: 'app:getVersion',
  copyProjectLink: 'app:copyProjectLink'
} as const

// `copied: false` when the system clipboard refused the text; the window
// says so instead of showing "Copied".
export interface CopyProjectLinkResult {
  copied: boolean
}
