import { PROJECT_URL } from '@shared/app-info'
import type { CopyProjectLinkResult } from '@shared/ipc/app-channels'

export interface AppHandlerDeps {
  version: () => string
  writeClipboard: (text: string) => void
  readClipboard: () => string
}

// The logic behind the app channels, free of Electron imports so it can be
// tested directly; ipc/app.ts only wires it to ipcMain.
export function createAppHandlers(deps: AppHandlerDeps): {
  getVersion: (raw: unknown) => string
  copyProjectLink: (raw: unknown) => CopyProjectLinkResult
} {
  // The preload sends nothing with these calls. Anything else is a caller
  // bug (or another page trying to pass a URL), so it throws.
  const expectNoPayload = (raw: unknown): void => {
    if (raw !== undefined) throw new Error('This call takes no arguments')
  }
  return {
    getVersion: (raw) => {
      expectNoPayload(raw)
      return deps.version()
    },
    copyProjectLink: (raw) => {
      expectNoPayload(raw)
      try {
        deps.writeClipboard(PROJECT_URL)
        // Electron doesn't report a failed write (Windows' clipboard can be
        // held open by another program), so read it back before saying
        // "Copied".
        return { copied: deps.readClipboard() === PROJECT_URL }
      } catch (error) {
        console.error('Copying the project link failed:', error)
        return { copied: false }
      }
    }
  }
}
