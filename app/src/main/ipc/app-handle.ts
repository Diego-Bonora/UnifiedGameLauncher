import { is } from '@electron-toolkit/utils'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { isAppSender } from '../security/ipc-sender'

// ipcMain.handle for channels that start programs or change saved data: only
// the app's own page may call them. Anything else is a caller bug or worse,
// so it throws (its message never reaches a user).
export function handleFromApp(
  channel: string,
  run: (event: IpcMainInvokeEvent, raw: unknown) => unknown
): void {
  ipcMain.handle(channel, (event, raw: unknown) => {
    const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    if (!isAppSender(event, devServerUrl)) throw new Error('Refused: not the app page')
    return run(event, raw)
  })
}
