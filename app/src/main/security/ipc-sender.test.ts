import { describe, expect, it } from 'vitest'
import { isAppSender, type IpcSenderInfo } from './ipc-sender'

function event(url: string | null, isMainFrame = true): IpcSenderInfo {
  const mainFrame = { url: url ?? '' }
  return {
    senderFrame: url === null ? null : isMainFrame ? mainFrame : { url },
    sender: { mainFrame }
  }
}

describe('isAppSender', () => {
  it("accepts the app's own bundled page", () => {
    expect(
      isAppSender(
        event('file:///C:/Program%20Files/App/resources/app.asar/out/renderer/index.html')
      )
    ).toBe(true)
  })

  it('accepts the dev server only when one is running', () => {
    expect(isAppSender(event('http://localhost:5173/'), 'http://localhost:5173')).toBe(true)
    expect(isAppSender(event('http://localhost:5173/'))).toBe(false)
  })

  it('refuses any other page, a sub-frame, or a frame that is gone', () => {
    expect(isAppSender(event('https://example.com/'), 'http://localhost:5173')).toBe(false)
    expect(isAppSender(event('http://localhost:5173.evil.com/'), 'http://localhost:5173')).toBe(
      false
    )
    expect(isAppSender(event('file:///C:/app/index.html', false))).toBe(false)
    expect(isAppSender(event(null))).toBe(false)
  })
})
