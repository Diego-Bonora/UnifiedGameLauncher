import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/ipc/updates'
import type { UpdateController } from '../updates/update-controller'
import { createUpdatesHandlers } from './updates-handlers'

const STATUS: UpdateStatus = {
  state: { kind: 'idle' },
  currentVersion: '0.9.0',
  enabled: true,
  settingsUnreadable: false,
  devBuild: false,
  updaterUnavailable: false
}

function fakeController(): UpdateController {
  return {
    start: vi.fn(async () => {}),
    getStatus: vi.fn(async () => STATUS),
    checkNow: vi.fn(async () => ({ accepted: true, status: STATUS })),
    download: vi.fn(async () => ({ accepted: true, status: STATUS })),
    restartAndInstall: vi.fn(async () => ({ accepted: false, status: STATUS })),
    setEnabled: vi.fn(async () => ({ saved: true, status: STATUS }))
  }
}

describe('updates handlers', () => {
  it.each(['getStatus', 'checkNow', 'download', 'restartAndInstall'] as const)(
    '%s takes no payload and refuses one',
    async (name) => {
      const controller = fakeController()
      const handlers = createUpdatesHandlers(controller)
      await expect(handlers[name](undefined)).resolves.toBeDefined()
      expect(controller[name]).toHaveBeenCalledTimes(1)
      await expect(handlers[name]({ url: 'https://example.com' })).rejects.toThrow('no arguments')
      expect(controller[name]).toHaveBeenCalledTimes(1)
    }
  )

  it('passes a valid switch value on', async () => {
    const controller = fakeController()
    await createUpdatesHandlers(controller).setEnabled({ enabled: false })
    expect(controller.setEnabled).toHaveBeenCalledWith(false)
  })

  it.each([undefined, {}, { enabled: 'no' }, { enabled: true, feedUrl: 'https://x' }])(
    'refuses a malformed switch request: %j',
    async (raw) => {
      const controller = fakeController()
      await expect(createUpdatesHandlers(controller).setEnabled(raw)).rejects.toThrow('Invalid')
      expect(controller.setEnabled).not.toHaveBeenCalled()
    }
  )
})
