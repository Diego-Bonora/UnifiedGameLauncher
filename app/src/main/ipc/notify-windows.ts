import { BrowserWindow } from 'electron'

// Sends a payload-free event to every open window. Used for "something new is
// on disk, re-read it" notices, where the window fetches the data itself
// through its normal handler.
export function notifyAllWindows(channel: string, logTag: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    // isDestroyed() can still be false for a window that is mid-teardown, and
    // send() then throws. Callers run this from a .then with nothing after
    // it, so an uncaught throw would be an unhandled rejection; and one bad
    // window must not stop the others from being told.
    try {
      if (!window.isDestroyed()) window.webContents.send(channel)
    } catch (err) {
      console.warn(`[${logTag}] could not notify a window:`, err)
    }
  }
}
