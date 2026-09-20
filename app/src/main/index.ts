import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APP_ID, APP_NAME } from '@shared/app-info'
import { isAllowedExternalUrl, isSameOrigin } from './security/external-url'
import { registerSteamIpc } from './ipc/steam'
import { registerSteamAuthIpc } from './ipc/steam-auth'

// Pin the data folder to %APPDATA%\<APP_NAME> so it can't drift if the
// package name or installer productName ever changes. Must run before anything
// reads userData. Dev runs get their own folder so `npm run dev` never shares
// data (or the single-instance lock) with an installed copy.
app.setPath('userData', join(app.getPath('appData'), is.dev ? `${APP_NAME} (dev)` : APP_NAME))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Set explicitly (not left to defaults) so a later edit can't weaken them silently.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Links in the page never open windows. Only the official launcher protocols
  // are handed to the OS.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window must never navigate away from the app while the preload is
  // attached. Only the Vite dev server (development) is allowed to reload it.
  const blockUnlessDevServer = (event: { preventDefault: () => void }, url: string): void => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    // Compare origins, not string prefixes: "http://localhost:5173.evil.com" starts with the dev URL.
    const isDevServer = is.dev && devUrl !== undefined && isSameOrigin(url, devUrl)
    if (!isDevServer) event.preventDefault()
  }
  mainWindow.webContents.on('will-navigate', blockUnlessDevServer)
  // A redirect after an allowed navigation is another way off the app.
  mainWindow.webContents.on('will-redirect', blockUnlessDevServer)

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Two instances would both write the same JSON store files.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)

    // The app never needs camera, microphone, notifications etc.
    // Both handlers are needed: the request handler covers prompts, the check
    // handler covers synchronous "am I allowed?" queries, which default to allow.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)

    registerSteamIpc()
    registerSteamAuthIpc()

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
