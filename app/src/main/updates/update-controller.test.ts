import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsRead, SettingsStore } from '../storage/settings-store'
import {
  CHECK_INTERVAL_MS,
  CHECK_TIMEOUT_MS,
  createUpdateController,
  DOWNLOAD_STALL_MS,
  FIRST_CHECK_DELAY_MS,
  FIRST_PROGRESS_WAIT_MS,
  type UpdaterPort
} from './update-controller'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type CheckResult = { available: true; version: string } | { available: false }

// Each check and download stays open until the test settles it, like a slow
// network, so every in-between state can be looked at.
function fakePort(
  availability: UpdaterPort['availability'] = 'active',
  // false: cancel() asks, but the download has already got past the point
  // where electron-updater looks at the token, so it still finishes.
  cancelSettles = true
): UpdaterPort & {
  checks: Deferred<CheckResult>[]
  downloads: { done: Deferred<'done' | 'cancelled'>; onPercent: (p: number) => void }[]
  cancels: number
  autoInstall: boolean[]
  installs: number
} {
  const port = {
    availability,
    checks: [] as Deferred<CheckResult>[],
    downloads: [] as { done: Deferred<'done' | 'cancelled'>; onPercent: (p: number) => void }[],
    cancels: 0,
    autoInstall: [] as boolean[],
    installs: 0,
    check: () => {
      const d = deferred<CheckResult>()
      port.checks.push(d)
      return d.promise
    },
    download: (onPercent: (p: number) => void) => {
      const done = deferred<'done' | 'cancelled'>()
      port.downloads.push({ done, onPercent })
      return {
        done: done.promise,
        cancel: () => {
          port.cancels++
          // Like the real port: a download stopped by cancel() settles as
          // 'cancelled'.
          if (cancelSettles) done.resolve('cancelled')
        }
      }
    },
    setAutoInstallOnAppQuit: (on: boolean) => {
      port.autoInstall.push(on)
    },
    quitAndInstall: () => {
      port.installs++
    }
  }
  return port
}

function fakeSettings(
  read: SettingsRead = { kind: 'ok', settings: { checkForUpdates: true } }
): SettingsStore & { saved: boolean[]; saveWorks: boolean } {
  const settings = {
    saved: [] as boolean[],
    saveWorks: true,
    read: async () => read,
    setCheckForUpdates: async (enabled: boolean) => {
      if (!settings.saveWorks) return false
      settings.saved.push(enabled)
      return true
    }
  }
  return settings
}

async function setup(
  options: { port?: ReturnType<typeof fakePort>; read?: SettingsRead } = {}
): Promise<{
  port: ReturnType<typeof fakePort>
  settings: ReturnType<typeof fakeSettings>
  controller: ReturnType<typeof createUpdateController>
  notified: () => number
}> {
  const port = options.port ?? fakePort()
  const settings = fakeSettings(options.read)
  let notifications = 0
  const controller = createUpdateController({
    port,
    settings,
    currentVersion: '0.9.0',
    onStatusChanged: () => {
      notifications++
    }
  })
  await controller.start()
  return { port, settings, controller, notified: () => notifications }
}

// The n-th check or download the controller started; fails the test
// rather than returning undefined when it never started.
function nthCheck(port: ReturnType<typeof fakePort>, n: number): Deferred<CheckResult> {
  const found = port.checks[n]
  if (!found) throw new Error(`check ${n} never started`)
  return found
}

function nthDownload(
  port: ReturnType<typeof fakePort>,
  n: number
): ReturnType<typeof fakePort>['downloads'][number] {
  const found = port.downloads[n]
  if (!found) throw new Error(`download ${n} never started`)
  return found
}

// Lets settled fake promises run their .then callbacks.
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('update controller: schedule', () => {
  it('checks about 10 s after start and then every 6 hours while the switch is on', async () => {
    const { port } = await setup()
    expect(port.autoInstall).toEqual([true])
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1)
    expect(port.checks).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(port.checks).toHaveLength(1)
    nthCheck(port, 0).resolve({ available: false })
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(port.checks).toHaveLength(2)
  })

  it('makes no request at all with the switch off', async () => {
    const { port, controller } = await setup({
      read: { kind: 'ok', settings: { checkForUpdates: false } }
    })
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(port.checks).toHaveLength(0)
    expect(port.autoInstall).toEqual([false])
    expect((await controller.getStatus()).enabled).toBe(false)
  })

  it('treats an unreadable settings file as off and says so', async () => {
    const { port, controller } = await setup({ read: { kind: 'unreadable' } })
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(port.checks).toHaveLength(0)
    const status = await controller.getStatus()
    expect(status.enabled).toBe(false)
    expect(status.settingsUnreadable).toBe(true)
  })

  it('never checks in a development build, not even on Check now', async () => {
    const { port, controller } = await setup({ port: fakePort('devBuild') })
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    const result = await controller.checkNow()
    expect(result.accepted).toBe(false)
    expect(result.status.devBuild).toBe(true)
    expect(port.checks).toHaveLength(0)
  })

  it('leaves a known version alone: no automatic check while one is available', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(port.checks).toHaveLength(1)
    expect((await controller.getStatus()).state).toEqual({ kind: 'available', version: '1.0.0' })
  })
})

describe('update controller: checks', () => {
  it('goes checking → available, or checking → up to date', async () => {
    const { port, controller } = await setup()
    const first = controller.checkNow()
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'checking' })
    nthCheck(port, 0).resolve({ available: false })
    expect((await first).status.state).toEqual({ kind: 'upToDate' })

    const second = controller.checkNow()

    await flush()
    nthCheck(port, 1).resolve({ available: true, version: '1.0.0' })
    expect((await second).status.state).toEqual({ kind: 'available', version: '1.0.0' })
  })

  it('marks a failed automatic check as automatic, and a failed Check now as manual', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(port, 0).reject(new Error('offline'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'checkFailed', manual: false })

    const manual = controller.checkNow()

    await flush()
    nthCheck(port, 1).reject(new Error('Cannot find latest.yml'))
    expect((await manual).status.state).toEqual({ kind: 'checkFailed', manual: true })
  })

  it('joins a running automatic check on Check now, and then shows its failure', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    const manual = controller.checkNow()
    await flush()
    expect(port.checks).toHaveLength(1)
    nthCheck(port, 0).reject(new Error('offline'))
    const result = await manual
    expect(result.accepted).toBe(true)
    expect(result.status.state).toEqual({ kind: 'checkFailed', manual: true })
  })

  it('runs Check now with the switch off', async () => {
    const { port, controller } = await setup({
      read: { kind: 'ok', settings: { checkForUpdates: false } }
    })
    const result = controller.checkNow()
    await flush()
    nthCheck(port, 0).resolve({ available: false })
    expect((await result).accepted).toBe(true)
  })

  it('refuses Check now while downloading or once an update is ready', async () => {
    const { port, controller } = await setup()
    const check = controller.checkNow()
    await flush()
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await check
    await controller.download()
    expect((await controller.checkNow()).accepted).toBe(false)
    nthDownload(port, 0).done.resolve('done')
    await flush()
    expect((await controller.checkNow()).accepted).toBe(false)
    expect(port.checks).toHaveLength(1)
  })
})

describe('update controller: download and install', () => {
  async function available(): Promise<Awaited<ReturnType<typeof setup>>> {
    const ctx = await setup()
    const check = ctx.controller.checkNow()
    await flush()
    nthCheck(ctx.port, 0).resolve({ available: true, version: '1.0.0' })
    await check
    return ctx
  }

  it('refuses Download when nothing is available', async () => {
    const { port, controller } = await setup()
    expect((await controller.download()).accepted).toBe(false)
    expect(port.downloads).toHaveLength(0)
  })

  it('reports whole percents only, then ready, and stops the schedule', async () => {
    const { port, controller, notified } = await available()
    const result = await controller.download()
    expect(result.accepted).toBe(true)
    expect(result.status.state).toEqual({ kind: 'downloading', version: '1.0.0', percent: 0 })

    const before = notified()
    nthDownload(port, 0).onPercent(12.2)
    nthDownload(port, 0).onPercent(12.9)
    expect(notified() - before).toBe(1)
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloading',
      version: '1.0.0',
      percent: 12
    })

    nthDownload(port, 0).done.resolve('done')
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'ready', version: '1.0.0' })
    // Stopped, not just skipping: no timer is left running.
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(port.checks).toHaveLength(1)
  })

  it('offers Download again after a failed download', async () => {
    const { port, controller } = await available()
    await controller.download()
    nthDownload(port, 0).done.reject(new Error('sha512 checksum mismatch'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloadFailed',
      version: '1.0.0'
    })
    expect((await controller.download()).accepted).toBe(true)
    expect(port.downloads).toHaveLength(2)
  })

  it('installs only from the ready state', async () => {
    const { port, controller } = await available()
    expect((await controller.restartAndInstall()).accepted).toBe(false)
    await controller.download()
    expect((await controller.restartAndInstall()).accepted).toBe(false)
    nthDownload(port, 0).done.resolve('done')
    await flush()
    expect((await controller.restartAndInstall()).accepted).toBe(true)
    expect(port.installs).toBe(1)
  })
})

describe('update controller: the switch', () => {
  it('turned off mid-download cancels it, stops install on quit and the schedule', async () => {
    const { port, controller, settings } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    await controller.download()

    const result = await controller.setEnabled(false)
    expect(result.saved).toBe(true)
    expect(settings.saved).toEqual([false])
    expect(port.cancels).toBe(1)
    expect(port.autoInstall.at(-1)).toBe(false)
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'available', version: '1.0.0' })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(port.checks).toHaveLength(1)
  })

  it('turned off with an update ready keeps Restart now working', async () => {
    const { port, controller } = await setup()
    const check = controller.checkNow()
    await flush()
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await check
    await controller.download()
    nthDownload(port, 0).done.resolve('done')
    await flush()
    await controller.setEnabled(false)
    expect(port.autoInstall.at(-1)).toBe(false)
    expect((await controller.restartAndInstall()).accepted).toBe(true)
  })

  it('turned on again from an unreadable file clears the warning and starts checking', async () => {
    const { port, controller } = await setup({ read: { kind: 'unreadable' } })
    const result = await controller.setEnabled(true)
    expect(result.status.enabled).toBe(true)
    expect(result.status.settingsUnreadable).toBe(false)
    expect(port.autoInstall.at(-1)).toBe(true)
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    expect(port.checks).toHaveLength(1)
  })

  it('changes nothing when the switch could not be saved', async () => {
    const { port, controller, settings } = await setup()
    settings.saveWorks = false
    const result = await controller.setEnabled(false)
    expect(result.saved).toBe(false)
    expect(result.status.enabled).toBe(true)
    expect(port.autoInstall).toEqual([true])
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    expect(port.checks).toHaveLength(1)
  })
})

describe('update controller: review fixes', () => {
  async function availableWith(
    port: ReturnType<typeof fakePort>
  ): Promise<Awaited<ReturnType<typeof setup>>> {
    const ctx = await setup({ port })
    const check = ctx.controller.checkNow()
    await flush()
    nthCheck(ctx.port, 0).resolve({ available: true, version: '1.0.0' })
    await check
    return ctx
  }

  it('starts one installer only, however often Restart now is pressed', async () => {
    const { port, controller } = await availableWith(fakePort())
    await controller.download()
    nthDownload(port, 0).done.resolve('done')
    await flush()
    const [first, second] = await Promise.all([
      controller.restartAndInstall(),
      controller.restartAndInstall()
    ])
    expect([first.accepted, second.accepted]).toEqual([true, false])
    expect(port.installs).toBe(1)
    // Turning the switch on now must not arm install-on-quit again.
    await controller.setEnabled(false)
    await controller.setEnabled(true)
    expect(port.autoInstall.at(-1)).toBe(false)
  })

  it('ends a check that hangs, and ignores its late answer', async () => {
    const { port, controller } = await setup()
    const manual = controller.checkNow()
    await flush()
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)
    expect((await manual).status.state).toEqual({ kind: 'checkFailed', manual: true })
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'checkFailed', manual: true })
  })

  it('stops a download that makes no progress, as a failure that can be retried', async () => {
    const { port, controller } = await availableWith(fakePort())
    await controller.download()
    await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS - 1000)
    // Progress restarts the clock.
    nthDownload(port, 0).onPercent(40)
    await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS - 1000)
    expect(port.cancels).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(port.cancels).toBe(1)
    await flush()
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloadFailed',
      version: '1.0.0'
    })
    expect((await controller.download()).accepted).toBe(true)
  })

  it('checks again automatically after a failed download', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    await controller.download()
    nthDownload(port, 0).done.reject(new Error('asset deleted'))
    await flush()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(port.checks).toHaveLength(2)
  })

  it('shows ready when switching off came too late to stop the download', async () => {
    const { port, controller } = await availableWith(fakePort('active', false))
    await controller.download()
    await controller.setEnabled(false)
    expect(port.cancels).toBe(1)
    nthDownload(port, 0).done.resolve('done')
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'ready', version: '1.0.0' })
    // The switch is off, so it doesn't install on quit; Restart now does.
    expect(port.autoInstall.at(-1)).toBe(false)
    expect((await controller.restartAndInstall()).accepted).toBe(true)
  })

  it('ignores progress that is not a number', async () => {
    const { port, controller, notified } = await availableWith(fakePort())
    await controller.download()
    const before = notified()
    nthDownload(port, 0).onPercent(Number.NaN)
    expect(notified()).toBe(before)
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloading',
      version: '1.0.0',
      percent: 0
    })
  })

  it('does not restart the schedule when the switch is set on while already on', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1000)
    await controller.setEnabled(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(port.checks).toHaveLength(1)
  })

  it('answers calls that arrive before settings.json has been read', async () => {
    const read = deferred<SettingsRead>()
    const settings = fakeSettings()
    settings.read = () => read.promise
    const controller = createUpdateController({
      port: fakePort(),
      settings,
      currentVersion: '0.9.0',
      onStatusChanged: () => {}
    })
    void controller.start()
    const early = controller.getStatus()
    read.resolve({ kind: 'ok', settings: { checkForUpdates: false } })
    expect((await early).enabled).toBe(false)
  })
})

describe('update controller: re-review fixes', () => {
  it('keeps offering Download again when the automatic check after a failed download fails', async () => {
    const { port, controller } = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    await controller.download()
    nthDownload(port, 0).done.reject(new Error('offline'))
    await flush()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    nthCheck(port, 1).reject(new Error('still offline'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloadFailed',
      version: '1.0.0'
    })
    expect((await controller.download()).accepted).toBe(true)
  })

  it('shows a failed Check now as such, even after a failed download', async () => {
    const { port, controller } = await setup()
    const first = controller.checkNow()
    await flush()
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await first
    await controller.download()
    nthDownload(port, 0).done.reject(new Error('offline'))
    await flush()
    const manual = controller.checkNow()
    await flush()
    nthCheck(port, 1).reject(new Error('still offline'))
    expect((await manual).status.state).toEqual({ kind: 'checkFailed', manual: true })
  })

  it('waits longer for the first progress report than between reports', async () => {
    const { port, controller } = await setup()
    const check = controller.checkNow()
    await flush()
    nthCheck(port, 0).resolve({ available: true, version: '1.0.0' })
    await check
    await controller.download()
    await vi.advanceTimersByTimeAsync(DOWNLOAD_STALL_MS * 2)
    expect(port.cancels).toBe(0)
    await vi.advanceTimersByTimeAsync(FIRST_PROGRESS_WAIT_MS - DOWNLOAD_STALL_MS * 2)
    expect(port.cancels).toBe(1)
  })

  it('says the updater is unavailable, not a development build, when it could not start', async () => {
    const { port, controller } = await setup({ port: fakePort('unavailable') })
    const status = await controller.getStatus()
    expect([status.devBuild, status.updaterUnavailable]).toEqual([false, true])
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect((await controller.checkNow()).accepted).toBe(false)
    expect(port.checks).toHaveLength(0)
  })
})

describe('update controller: the failed version is remembered', () => {
  // A download of 1.0.0 that failed, found by an automatic check.
  async function afterFailedDownload(): Promise<Awaited<ReturnType<typeof setup>>> {
    const ctx = await setup()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    nthCheck(ctx.port, 0).resolve({ available: true, version: '1.0.0' })
    await flush()
    await ctx.controller.download()
    nthDownload(ctx.port, 0).done.reject(new Error('offline'))
    await flush()
    return ctx
  }

  it('brings Download again back after a failed Check now, at the next failed automatic check', async () => {
    const { port, controller } = await afterFailedDownload()
    const manual = controller.checkNow()
    await flush()
    nthCheck(port, 1).reject(new Error('offline'))
    expect((await manual).status.state).toEqual({ kind: 'checkFailed', manual: true })
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    nthCheck(port, 2).reject(new Error('offline'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({
      kind: 'downloadFailed',
      version: '1.0.0'
    })
  })

  it('stops offering it after a check that timed out', async () => {
    const { port, controller } = await afterFailedDownload()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(port.checks).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)
    expect((await controller.getStatus()).state).toEqual({ kind: 'checkFailed', manual: false })
    expect((await controller.download()).accepted).toBe(false)
    // A later plain failure doesn't bring it back either.
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - CHECK_TIMEOUT_MS)
    nthCheck(port, 2).reject(new Error('offline'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'checkFailed', manual: false })
  })

  it('forgets it once a check succeeds', async () => {
    const { port, controller } = await afterFailedDownload()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    nthCheck(port, 1).resolve({ available: false })
    await flush()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    nthCheck(port, 2).reject(new Error('offline'))
    await flush()
    expect((await controller.getStatus()).state).toEqual({ kind: 'checkFailed', manual: false })
  })
})
