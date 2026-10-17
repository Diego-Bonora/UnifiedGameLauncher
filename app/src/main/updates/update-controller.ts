import type {
  UpdateActionResult,
  UpdateSetEnabledResult,
  UpdateState,
  UpdateStatus
} from '@shared/ipc/updates-channels'
import type { SettingsStore } from '../storage/settings-store'

// The updater's one state machine (docs/features/release.md, section 4). Free
// of Electron imports so it can be tested directly: electron-updater is
// reached only through UpdaterPort (electron-updater-port.ts).

export interface UpdaterPort {
  // Anything but 'active' and nothing is ever checked: 'devBuild' in an
  // unpackaged build, 'unavailable' when electron-updater couldn't start.
  availability: 'active' | 'devBuild' | 'unavailable'
  // Rejects when the check fails (offline, GitHub unreachable, a release
  // without latest.yml).
  check: () => Promise<{ available: true; version: string } | { available: false }>
  // `done` resolves 'cancelled' only after cancel(); any other failure
  // rejects. A download whose sha512 doesn't match latest.yml rejects too.
  download: (onPercent: (percent: number) => void) => {
    done: Promise<'done' | 'cancelled'>
    cancel: () => void
  }
  setAutoInstallOnAppQuit: (on: boolean) => void
  quitAndInstall: () => void
}

export interface UpdateControllerDeps {
  port: UpdaterPort
  settings: SettingsStore
  currentVersion: string
  onStatusChanged: () => void
}

export const FIRST_CHECK_DELAY_MS = 10_000
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
// electron-updater's own request timeout never fires under Electron's net
// module (it waits for a `socket` event Electron doesn't emit), so a stalled
// connection would leave "Checking…" or "Downloading NN%" up for the whole
// run. These limits end the wait here instead.
export const CHECK_TIMEOUT_MS = 60_000
// Measured from the last progress event, not the start: a slow but moving
// download is fine.
export const DOWNLOAD_STALL_MS = 2 * 60_000
// Until the first progress event: progress needs the server to send the
// file's size, so a proxy that leaves it out gets a longer, single limit
// instead of a stall every 2 minutes.
export const FIRST_PROGRESS_WAIT_MS = 10 * 60_000

export interface UpdateController {
  // Reads the switch and starts the schedule. Every other call waits for it.
  start: () => Promise<void>
  getStatus: () => Promise<UpdateStatus>
  checkNow: () => Promise<UpdateActionResult>
  download: () => Promise<UpdateActionResult>
  restartAndInstall: () => Promise<UpdateActionResult>
  setEnabled: (enabled: boolean) => Promise<UpdateSetEnabledResult>
}

export function createUpdateController(deps: UpdateControllerDeps): UpdateController {
  const { port } = deps
  let state: UpdateState = { kind: 'idle' }
  // Off until settings.json has been read, so nothing runs before the
  // user's choice is known.
  let enabled = false
  let settingsUnreadable = false
  // The running check, shared by an automatic check and a Check now that
  // arrives during it. `manual` is set by either, so the failure is shown.
  let check: { manual: boolean; promise: Promise<void> } | null = null
  // The running download. Callbacks from any other (older) download are
  // ignored, so a late one can't overwrite this one's state.
  let download: { cancel: () => void; stalled: boolean } | null = null
  let firstCheck: ReturnType<typeof setTimeout> | null = null
  let interval: ReturnType<typeof setInterval> | null = null
  // Set by the first accepted Restart now. electron-updater undoes its own
  // "already installing" flag when asked twice, which would let a second
  // installer start at quit, so main refuses every later request itself.
  let installRequested = false
  // The version whose download failed, kept until a check succeeds. An
  // automatic check that fails (most often the same bad connection) goes
  // back to offering Download again for it, rather than to a state that
  // shows nothing and refuses Download; also after a failed Check now.
  let retryVersion: string | null = null

  let started: Promise<void> | null = null

  function status(): UpdateStatus {
    return {
      state,
      currentVersion: deps.currentVersion,
      enabled,
      settingsUnreadable,
      devBuild: port.availability === 'devBuild',
      updaterUnavailable: port.availability === 'unavailable'
    }
  }

  function setState(next: UpdateState): void {
    state = next
    deps.onStatusChanged()
  }

  function stopSchedule(): void {
    if (firstCheck !== null) clearTimeout(firstCheck)
    if (interval !== null) clearInterval(interval)
    firstCheck = null
    interval = null
  }

  function startSchedule(): void {
    stopSchedule()
    if (port.availability !== 'active' || !enabled || state.kind === 'ready') return
    // Delayed so the library draws before any network request.
    firstCheck = setTimeout(automaticCheck, FIRST_CHECK_DELAY_MS)
    interval = setInterval(automaticCheck, CHECK_INTERVAL_MS)
  }

  function automaticCheck(): void {
    // While a version is offered, downloading or downloaded, automatic
    // checks leave it alone: a re-check would hide the sidebar notice while
    // it runs, or switch the version under a download. After a failed
    // download they go on, so a fixed release replaces a broken one.
    const known = ['available', 'downloading', 'ready']
    if (!enabled || known.includes(state.kind)) return
    void runCheck(false)
  }

  // false when a check can't start: a download is running or done, or this
  // is a development build.
  function runCheck(manual: boolean): Promise<void> | false {
    if (port.availability !== 'active' || installRequested) return false
    if (state.kind === 'downloading' || state.kind === 'ready') return false
    if (check !== null) {
      if (manual) check.manual = true
      return check.promise
    }
    const running = { manual, promise: Promise.resolve() }
    check = running
    setState({ kind: 'checking' })
    running.promise = (async () => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let timedOut = false
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            reject(new Error('update check timed out'))
          }, CHECK_TIMEOUT_MS)
        })
        const result = await Promise.race([port.check(), timeout])
        retryVersion = null
        setState(
          result.available ? { kind: 'available', version: result.version } : { kind: 'upToDate' }
        )
      } catch (err) {
        // The failure is handled here, once. electron-updater's own `error`
        // event is only logged by the port.
        console.warn('[updates] check failed:', err)
        // A timed-out request may still be hanging inside electron-updater.
        // If it answers later, electron-updater quietly switches what
        // Download would fetch, so the failed version is no longer safe to
        // offer: only a check that succeeds brings Download back.
        if (timedOut) retryVersion = null
        setState(
          retryVersion !== null && !running.manual
            ? { kind: 'downloadFailed', version: retryVersion }
            : { kind: 'checkFailed', manual: running.manual }
        )
      } finally {
        if (timer !== null) clearTimeout(timer)
        check = null
      }
    })()
    return running.promise
  }

  function startDownload(version: string): void {
    setState({ kind: 'downloading', version, percent: 0 })
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    const current = { cancel: () => {}, stalled: false }
    const armStallTimer = (ms: number): void => {
      if (stallTimer !== null) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        current.stalled = true
        current.cancel()
      }, ms)
    }
    const handle = port.download((raw) => {
      if (download !== current || !Number.isFinite(raw)) return
      armStallTimer(DOWNLOAD_STALL_MS)
      const percent = Math.max(0, Math.min(100, Math.floor(raw)))
      // Whole percents only: progress events come many times a second.
      if (state.kind === 'downloading' && percent !== state.percent) {
        setState({ kind: 'downloading', version, percent })
      }
    })
    current.cancel = handle.cancel
    download = current
    armStallTimer(FIRST_PROGRESS_WAIT_MS)
    const finish = (next: UpdateState): void => {
      if (stallTimer !== null) clearTimeout(stallTimer)
      if (download !== current) return
      download = null
      setState(next)
    }
    handle.done.then(
      (outcome) => {
        if (outcome === 'cancelled') {
          // Stalled: a failure the user can retry. Switched off: back to
          // offering the version.
          if (current.stalled) {
            console.warn('[updates] download stalled, stopped it')
            retryVersion = version
          }
          finish(
            current.stalled ? { kind: 'downloadFailed', version } : { kind: 'available', version }
          )
          return
        }
        finish({ kind: 'ready', version })
        // From here the state can't fall back to "available".
        stopSchedule()
      },
      (err: unknown) => {
        console.warn('[updates] download failed:', err)
        retryVersion = version
        finish({ kind: 'downloadFailed', version })
      }
    )
  }

  async function whenStarted(): Promise<void> {
    if (started === null) throw new Error('update controller used before start()')
    await started
  }

  return {
    start: () => {
      started ??= (async () => {
        const read = await deps.settings.read()
        settingsUnreadable = read.kind === 'unreadable'
        enabled = read.kind === 'ok' && read.settings.checkForUpdates
        port.setAutoInstallOnAppQuit(enabled)
        startSchedule()
        deps.onStatusChanged()
      })()
      return started
    },

    getStatus: async () => {
      await whenStarted()
      return status()
    },

    checkNow: async () => {
      await whenStarted()
      // A press the user made: it runs even with the switch off.
      const running = runCheck(true)
      if (running === false) return { accepted: false, status: status() }
      await running
      return { accepted: true, status: status() }
    },

    download: async () => {
      await whenStarted()
      if ((state.kind !== 'available' && state.kind !== 'downloadFailed') || installRequested) {
        return { accepted: false, status: status() }
      }
      // Answers at once; progress and the outcome arrive as status changes.
      startDownload(state.version)
      return { accepted: true, status: status() }
    },

    restartAndInstall: async () => {
      await whenStarted()
      // Only main's own state decides: the window can't install anything
      // that wasn't downloaded and checked here.
      if (state.kind !== 'ready' || installRequested) return { accepted: false, status: status() }
      installRequested = true
      port.quitAndInstall()
      return { accepted: true, status: status() }
    },

    setEnabled: async (next) => {
      await whenStarted()
      const saved = await deps.settings.setCheckForUpdates(next)
      if (!saved) return { saved: false, status: status() }
      const wasEnabled = enabled
      enabled = next
      settingsUnreadable = false
      // Off: an update already downloaded no longer installs on quit
      // (Restart now still does), and a running download stops.
      port.setAutoInstallOnAppQuit(next && !installRequested)
      if (!next) {
        stopSchedule()
        download?.cancel()
      } else if (!wasEnabled) {
        // Only when it was off: saying "on" again (Settings re-sending the
        // value) must not restart the 10-second check.
        startSchedule()
      }
      deps.onStatusChanged()
      return { saved: true, status: status() }
    }
  }
}
