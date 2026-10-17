import { app } from 'electron'
import { autoUpdater, CancellationToken, type ProgressInfo } from 'electron-updater'
import type { UpdaterPort } from './update-controller'

// The one place electron-updater is used. Updates come only from the
// `publish` block in electron-builder.yml, which electron-builder writes into
// the installed app as app-update.yml; nothing here or in the window can
// point the updater anywhere else.
export function createElectronUpdaterPort(): UpdaterPort {
  // Set explicitly, because some defaults break the spec: the default
  // autoDownload would download without asking.
  autoUpdater.autoDownload = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  // The controller turns this on from the switch once settings.json is read.
  autoUpdater.autoInstallOnAppQuit = false
  // Restart now starts the app again after a normal (non-silent) install.
  autoUpdater.autoRunAppAfterInstall = true
  // Releases ship a full installer, never the web installer.
  autoUpdater.disableWebInstaller = true

  // Every failure is handled by the promise of the call that failed
  // (update-controller.ts); this only tags the log line, next to
  // electron-updater's own logging of the same event.
  autoUpdater.on('error', (err) => {
    console.warn('[updates] electron-updater reported:', err.message)
  })

  return {
    availability: app.isPackaged ? 'active' : 'devBuild',

    check: async () => {
      const result = await autoUpdater.checkForUpdates()
      if (result === null || !result.isUpdateAvailable) return { available: false }
      return { available: true, version: result.updateInfo.version }
    },

    download: (onPercent) => {
      const token = new CancellationToken()
      // electron-updater's cancellation error isn't exported, so a failure
      // after our own cancel() is what counts as "cancelled".
      let cancelled = false
      const listener = (progress: ProgressInfo): void => onPercent(progress.percent)
      autoUpdater.on('download-progress', listener)
      const done = autoUpdater
        .downloadUpdate(token)
        .then(
          (): 'done' => 'done',
          (err: unknown): 'cancelled' => {
            if (cancelled) return 'cancelled'
            throw err
          }
        )
        .finally(() => {
          autoUpdater.off('download-progress', listener)
        })
      return {
        done,
        cancel: () => {
          cancelled = true
          token.cancel()
        }
      }
    },

    setAutoInstallOnAppQuit: (on) => {
      autoUpdater.autoInstallOnAppQuit = on
    },

    quitAndInstall: () => {
      // The installer starts the new copy when it finishes; release the
      // single-instance lock as this copy quits, so the new one isn't
      // refused while this one is still closing.
      app.once('before-quit', () => app.releaseSingleInstanceLock())
      // The install-on-quit handler must not start a second, silent
      // installer as this copy quits.
      autoUpdater.autoInstallOnAppQuit = false
      // Not silent: the user sees the installer, and autoRunAppAfterInstall
      // (set above) starts the new version when it finishes. The second
      // argument only matters for silent installs.
      autoUpdater.quitAndInstall(false)
    }
  }
}
