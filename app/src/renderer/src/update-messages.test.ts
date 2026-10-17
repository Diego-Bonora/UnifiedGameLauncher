import { describe, expect, it } from 'vitest'
import type { UpdateState, UpdateStatus } from '@shared/ipc/updates-channels'
import {
  AUTOMATIC_CHECK_FAILED,
  CHECK_NOW_FAILED,
  DEV_BUILD,
  DOWNLOAD_FAILED,
  settingsActions,
  settingsLine,
  sidebarNotice,
  UPDATER_UNAVAILABLE
} from './update-messages'

function status(state: UpdateState, extra: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state,
    currentVersion: '0.9.0',
    enabled: true,
    settingsUnreadable: false,
    devBuild: false,
    updaterUnavailable: false,
    ...extra
  }
}

describe('sidebarNotice', () => {
  it('shows nothing before the status is known, or for checks and their failures', () => {
    expect(sidebarNotice(null, null)).toBeNull()
    for (const state of [
      { kind: 'idle' },
      { kind: 'checking' },
      { kind: 'upToDate' },
      { kind: 'checkFailed', manual: false },
      { kind: 'checkFailed', manual: true }
    ] as UpdateState[]) {
      expect(sidebarNotice(status(state), null)).toBeNull()
    }
  })

  it('offers a version until Later is pressed for that version', () => {
    const available = status({ kind: 'available', version: '1.0.0' })
    expect(sidebarNotice(available, null)).toEqual({ kind: 'available', version: '1.0.0' })
    expect(sidebarNotice(available, '1.0.0')).toBeNull()
    // Later on an older version doesn't hide a newer one.
    expect(sidebarNotice(available, '0.9.5')).toEqual({ kind: 'available', version: '1.0.0' })
  })

  it('offers Download again after a failed download, also hidden by Later', () => {
    const failed = status({ kind: 'downloadFailed', version: '1.0.0' })
    expect(sidebarNotice(failed, null)).toEqual({ kind: 'downloadFailed', version: '1.0.0' })
    expect(sidebarNotice(failed, '1.0.0')).toBeNull()
  })

  it('always shows a download the user started and a finished one', () => {
    expect(
      sidebarNotice(status({ kind: 'downloading', version: '1.0.0', percent: 42 }), '1.0.0')
    ).toEqual({ kind: 'downloading', version: '1.0.0', percent: 42 })
    expect(sidebarNotice(status({ kind: 'ready', version: '1.0.0' }), '1.0.0')).toEqual({
      kind: 'ready',
      version: '1.0.0'
    })
  })
})

describe('settingsLine', () => {
  it('words each state as the spec does', () => {
    expect(settingsLine(status({ kind: 'upToDate' })).text).toBe(
      "You're up to date (version 0.9.0)."
    )
    expect(settingsLine(status({ kind: 'available', version: '1.0.0' })).text).toBe(
      'Version 1.0.0 is available.'
    )
    expect(settingsLine(status({ kind: 'ready', version: '1.0.0' })).text).toBe(
      'Ready to install: restart the app.'
    )
  })

  it('keeps the downloading text steady while the percent changes', () => {
    const a = settingsLine(status({ kind: 'downloading', version: '1.0.0', percent: 1 }))
    const b = settingsLine(status({ kind: 'downloading', version: '1.0.0', percent: 99 }))
    expect(a).toEqual(b)
  })

  it('tells a failed Check now from a failed automatic check', () => {
    expect(settingsLine(status({ kind: 'checkFailed', manual: true }))).toEqual({
      text: CHECK_NOW_FAILED,
      tone: 'danger'
    })
    expect(settingsLine(status({ kind: 'checkFailed', manual: false }))).toEqual({
      text: AUTOMATIC_CHECK_FAILED,
      tone: 'muted'
    })
    expect(settingsLine(status({ kind: 'downloadFailed', version: '1.0.0' })).text).toBe(
      DOWNLOAD_FAILED
    )
  })

  it('says why a copy never checks', () => {
    expect(settingsLine(status({ kind: 'idle' }, { devBuild: true })).text).toBe(DEV_BUILD)
    expect(settingsLine(status({ kind: 'idle' }, { updaterUnavailable: true })).text).toBe(
      UPDATER_UNAVAILABLE
    )
  })
})

describe('settingsActions', () => {
  it('offers only what main would accept', () => {
    expect(settingsActions(status({ kind: 'idle' }))).toEqual({
      checkNow: true,
      download: false,
      restart: false
    })
    expect(settingsActions(status({ kind: 'downloadFailed', version: '1.0.0' }))).toEqual({
      checkNow: true,
      download: true,
      restart: false
    })
    expect(settingsActions(status({ kind: 'downloading', version: '1.0.0', percent: 3 }))).toEqual({
      checkNow: false,
      download: false,
      restart: false
    })
    expect(settingsActions(status({ kind: 'ready', version: '1.0.0' }))).toEqual({
      checkNow: false,
      download: false,
      restart: true
    })
  })

  it('offers nothing in a copy that never checks', () => {
    for (const extra of [{ devBuild: true }, { updaterUnavailable: true }]) {
      expect(settingsActions(status({ kind: 'available', version: '1.0.0' }, extra))).toEqual({
        checkNow: false,
        download: false,
        restart: false
      })
    }
  })
})
