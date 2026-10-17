import { describe, expect, it, vi } from 'vitest'
import { PROJECT_URL } from '@shared/app-info'
import { createAppHandlers } from './app-handlers'

// A clipboard that keeps what was written, unless told to ignore writes.
function setup(writeClipboard?: (text: string) => void): {
  handlers: ReturnType<typeof createAppHandlers>
  write: ReturnType<typeof vi.fn>
} {
  let contents = 'what was there before'
  const write = vi.fn(
    writeClipboard ??
      ((text: string) => {
        contents = text
      })
  )
  const handlers = createAppHandlers({
    version: () => '0.9.0',
    writeClipboard: write,
    readClipboard: () => contents
  })
  return { handlers, write }
}

describe('app handlers', () => {
  it("returns main's version", () => {
    expect(setup().handlers.getVersion(undefined)).toBe('0.9.0')
  })

  it('copies exactly the project URL', () => {
    const { handlers, write } = setup()
    expect(handlers.copyProjectLink(undefined)).toEqual({ copied: true })
    expect(write.mock.calls).toEqual([[PROJECT_URL]])
  })

  it('reports a clipboard failure as data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handlers } = setup(() => {
      throw new Error('clipboard busy')
    })
    expect(handlers.copyProjectLink(undefined)).toEqual({ copied: false })
  })

  it("reports a write the clipboard silently didn't take", () => {
    const { handlers, write } = setup(() => {})
    expect(handlers.copyProjectLink(undefined)).toEqual({ copied: false })
    expect(write).toHaveBeenCalledOnce()
  })

  it.each([
    ['a URL', 'https://example.com'],
    ['an object', { url: 'x' }],
    ['null', null]
  ])('refuses a payload (%s) and copies nothing', (_name, raw) => {
    const { handlers, write } = setup()
    expect(() => handlers.copyProjectLink(raw)).toThrow()
    expect(() => handlers.getVersion(raw)).toThrow()
    expect(write).not.toHaveBeenCalled()
  })
})
