import { app } from 'electron'
import { UPDATES_CHANNELS } from '@shared/ipc/updates'
import { createSettingsStore } from '../storage/settings-store'
import { createElectronUpdaterPort } from '../updates/electron-updater-port'
import { createUpdateController, type UpdaterPort } from '../updates/update-controller'
import { handleFromApp } from './app-handle'
import { notifyAllWindows } from './notify-windows'
import { createUpdatesHandlers } from './updates-handlers'

// electron-updater refuses to start when the app's version isn't valid
// semver. That must not stop the window from opening (this runs before it
// does), so the updater is then simply never used.
function updaterPortOrInactive(): UpdaterPort {
  try {
    return createElectronUpdaterPort()
  } catch (err) {
    console.error('[updates] the updater could not start; updates are off:', err)
    return {
      availability: 'unavailable',
      check: async () => ({ available: false }),
      download: () => ({ done: Promise.resolve('cancelled'), cancel: () => {} }),
      setAutoInstallOnAppQuit: () => {},
      quitAndInstall: () => {}
    }
  }
}

export function registerUpdatesIpc(): void {
  const controller = createUpdateController({
    port: updaterPortOrInactive(),
    settings: createSettingsStore(),
    currentVersion: app.getVersion(),
    onStatusChanged: () => notifyAllWindows(UPDATES_CHANNELS.statusChanged, 'updates')
  })
  void controller.start()

  const handlers = createUpdatesHandlers(controller)
  handleFromApp(UPDATES_CHANNELS.getStatus, (_event, raw: unknown) => handlers.getStatus(raw))
  handleFromApp(UPDATES_CHANNELS.checkNow, (_event, raw: unknown) => handlers.checkNow(raw))
  handleFromApp(UPDATES_CHANNELS.download, (_event, raw: unknown) => handlers.download(raw))
  handleFromApp(UPDATES_CHANNELS.restartAndInstall, (_event, raw: unknown) =>
    handlers.restartAndInstall(raw)
  )
  handleFromApp(UPDATES_CHANNELS.setEnabled, (_event, raw: unknown) => handlers.setEnabled(raw))
}
