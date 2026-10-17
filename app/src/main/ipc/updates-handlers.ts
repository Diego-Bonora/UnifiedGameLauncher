import {
  parseSetEnabledRequest,
  type UpdateActionResult,
  type UpdateSetEnabledResult,
  type UpdateStatus
} from '@shared/ipc/updates'
import type { UpdateController } from '../updates/update-controller'

// The logic behind the updates channels, free of Electron imports so it can
// be tested directly; ipc/updates.ts only wires it to ipcMain.
export function createUpdatesHandlers(controller: UpdateController): {
  getStatus: (raw: unknown) => Promise<UpdateStatus>
  checkNow: (raw: unknown) => Promise<UpdateActionResult>
  download: (raw: unknown) => Promise<UpdateActionResult>
  restartAndInstall: (raw: unknown) => Promise<UpdateActionResult>
  setEnabled: (raw: unknown) => Promise<UpdateSetEnabledResult>
} {
  // The preload sends nothing with these calls; anything else is a caller
  // bug, so it throws rather than returning a message for the user.
  const expectNoPayload = (raw: unknown): void => {
    if (raw !== undefined) throw new Error('This call takes no arguments')
  }
  return {
    getStatus: async (raw) => {
      expectNoPayload(raw)
      return controller.getStatus()
    },
    checkNow: async (raw) => {
      expectNoPayload(raw)
      return controller.checkNow()
    },
    download: async (raw) => {
      expectNoPayload(raw)
      return controller.download()
    },
    restartAndInstall: async (raw) => {
      expectNoPayload(raw)
      return controller.restartAndInstall()
    },
    setEnabled: async (raw) => {
      const request = parseSetEnabledRequest(raw)
      if (request === null) throw new Error('Invalid updates switch request')
      return controller.setEnabled(request.enabled)
    }
  }
}
