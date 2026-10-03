import { randomUUID } from 'node:crypto'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { MANUAL_CHANNELS } from '@shared/ipc/manual'
import type { FavoritesStore } from '../storage/favorites-store'
import { createManualProvider, type ManualGamesFile } from '../stores/manual'
import { exeFileName, isExeFile, resolveExePath, suggestedTitle } from '../stores/manual/exe-path'
import { isAppSender } from '../security/ipc-sender'
import { createManualHandlers } from './manual-handlers'

// Dialogs belong to the window that asked, so they stay on top of it and
// block it while open.
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

async function showExePicker(window: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Pick the game’s .exe',
    properties: ['openFile', 'dontAddToRecent'],
    filters: [{ name: 'Programs', extensions: ['exe'] }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

// Main's own dialog, which the app window can't draw, skip or answer: the
// one guard against a compromised window saving arguments that turn a
// manual game such as powershell.exe into "run any command" (spec,
// "Confirming arguments").
async function confirmArgs(
  window: BrowserWindow | null,
  exePath: string,
  args: string
): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Launch arguments',
    message: `Save launch arguments for ${exeFileName(exePath)}?`,
    detail: `${args}\n\nOnly choose Save if you typed these yourself.`,
    buttons: ['Save', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)
  return result.response === 0
}

// `file` and `favorites` are the app's single stores (one save queue each).
export function registerManualIpc(file: ManualGamesFile, favorites: FavoritesStore): void {
  // Made once: the pending pick must survive from pickExe to add.
  const handlers = createManualHandlers<BrowserWindow | null>({
    file,
    provider: createManualProvider(file),
    pickExe: (window) => showExePicker(window),
    confirmArgs: (window, exePath, args) => confirmArgs(window, exePath, args),
    isExeFile: (path) => isExeFile(path),
    resolveExePath: (path) => resolveExePath(path),
    suggestedTitle,
    removeFavorite: (key) => favorites.set(key, false),
    newId: () => randomUUID()
  })

  // These channels start programs: only the app's own page may call them
  // (a caller bug or worse otherwise, so it throws).
  const handle = (
    channel: string,
    run: (event: IpcMainInvokeEvent, raw: unknown) => unknown
  ): void => {
    ipcMain.handle(channel, (event, raw: unknown) => {
      const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
      if (!isAppSender(event, devServerUrl)) throw new Error('Refused: not the app page')
      return run(event, raw)
    })
  }

  handle(MANUAL_CHANNELS.list, () => handlers.list())
  handle(MANUAL_CHANNELS.pickExe, (event) => handlers.pickExe(senderWindow(event)))
  handle(MANUAL_CHANNELS.add, (event, raw) => handlers.add(senderWindow(event), raw))
  handle(MANUAL_CHANNELS.cancelAdd, () => handlers.cancelAdd())
  handle(MANUAL_CHANNELS.rename, (_event, raw) => handlers.rename(raw))
  handle(MANUAL_CHANNELS.setArgs, (event, raw) => handlers.setArgs(senderWindow(event), raw))
  handle(MANUAL_CHANNELS.changeExe, (event, raw) => handlers.changeExe(senderWindow(event), raw))
  handle(MANUAL_CHANNELS.remove, (_event, raw) => handlers.remove(raw))
  handle(MANUAL_CHANNELS.launch, (_event, raw) => handlers.launch(raw))

  // A reload or a crashed page loses the open Add form, so the pick it was
  // for is forgotten too: it can never be added under some later form.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) handlers.cancelAdd()
    })
    contents.on('render-process-gone', () => handlers.cancelAdd())
  })
}
