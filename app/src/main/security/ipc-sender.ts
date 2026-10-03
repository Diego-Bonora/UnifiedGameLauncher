import { isSameOrigin } from './external-url'

// The parts of an IPC event this needs, so it can be tested without Electron.
export interface IpcSenderInfo {
  senderFrame: { url: string } | null
  sender: { mainFrame: unknown }
}

// Whether an IPC call came from the app's own page: its top-level frame, on
// the bundled file (or, in development, the dev server). Navigation away from
// the app is already blocked (index.ts); this is a second lock for the
// channels that start programs, should anything else ever end up in the
// window.
export function isAppSender(event: IpcSenderInfo, devServerUrl?: string): boolean {
  const frame = event.senderFrame
  if (frame === null || frame !== event.sender.mainFrame) return false
  let url: URL
  try {
    url = new URL(frame.url)
  } catch {
    return false
  }
  if (url.protocol === 'file:') return true
  return devServerUrl !== undefined && isSameOrigin(frame.url, devServerUrl)
}
