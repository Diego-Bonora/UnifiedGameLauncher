import { describe, expect, it } from 'vitest'
import type { SteamLibraryProblem } from '@shared/ipc/steam-channels'
import { libraryNotice, retryDelayMs } from './library-problems'

const PROBLEMS: SteamLibraryProblem[] = ['offline', 'keyRejected', 'unavailable', 'empty']

describe('libraryNotice', () => {
  it('shows the offline pill only above a saved library', () => {
    expect(libraryNotice('offline', true)).toEqual({
      tone: 'pill',
      text: 'Offline — showing saved library'
    })
    expect(libraryNotice('offline', false).tone).toBe('muted')
  })

  it('tells the user what to do when the key may be wrong, without claiming it is', () => {
    for (const hasSavedCopy of [true, false]) {
      const notice = libraryNotice('keyRejected', hasSavedCopy)
      expect(notice.tone).toBe('danger')
      expect(notice.text).toContain('may be wrong')
      expect(notice.text).toContain('remove it and add it again')
    }
  })

  it('mentions the saved library only when one is showing', () => {
    for (const problem of PROBLEMS) {
      expect(libraryNotice(problem, true).text.toLowerCase()).toMatch(/saved library/)
    }
    for (const problem of ['keyRejected', 'unavailable', 'empty'] as const) {
      expect(libraryNotice(problem, false).text.toLowerCase()).not.toMatch(/saved library/)
    }
  })

  it('explains a private profile when Steam returns an empty library', () => {
    expect(libraryNotice('empty', true).text).toContain('private')
    expect(libraryNotice('empty', false).text).toContain('private')
  })

  it('has friendly text for every problem and never leaks raw error markers', () => {
    for (const problem of PROBLEMS) {
      for (const hasSavedCopy of [true, false]) {
        const { text } = libraryNotice(problem, hasSavedCopy)
        expect(text.length).toBeGreaterThan(10)
        expect(text).not.toMatch(/Error|invoking|remote method|TypeError|\b[45]\d\d\b|steam:/)
      }
    }
  })
})

describe('retryDelayMs', () => {
  it('backs off 5 s, 15 s, then a minute, and stays there', () => {
    expect([1, 2, 3, 4, 10, 1000].map(retryDelayMs)).toEqual([
      5_000, 15_000, 60_000, 60_000, 60_000, 60_000
    ])
  })

  it('treats zero or negative failures as the first retry', () => {
    expect(retryDelayMs(0)).toBe(5_000)
    expect(retryDelayMs(-3)).toBe(5_000)
  })
})
