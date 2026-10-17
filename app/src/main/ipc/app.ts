import { app, clipboard } from 'electron'
import { APP_CHANNELS } from '@shared/ipc/app-channels'
import { handleFromApp } from './app-handle'
import { createAppHandlers } from './app-handlers'

// Main writes the clipboard itself: the window's permission handlers refuse
// everything, clipboard writes included (index.ts), and should stay that way.
export function registerAppIpc(): void {
  const handlers = createAppHandlers({
    version: () => app.getVersion(),
    writeClipboard: (text) => clipboard.writeText(text),
    readClipboard: () => clipboard.readText()
  })
  handleFromApp(APP_CHANNELS.getVersion, (_event, raw: unknown) => handlers.getVersion(raw))
  handleFromApp(APP_CHANNELS.copyProjectLink, (_event, raw: unknown) =>
    handlers.copyProjectLink(raw)
  )
}
