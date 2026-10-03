import { describe, expect, it } from 'vitest'
import {
  COVER_KEY_REJECTED_NOTICE,
  coverKeyMessage,
  coverStatusLine,
  shouldShowKeyForm,
  showCoverKeyRejectedNotice
} from './epic-cover-messages'

describe('coverStatusLine', () => {
  it('invites adding a key when none is saved', () => {
    expect(coverStatusLine({ hasKey: false, problem: null })).toEqual({
      text: expect.stringContaining('Add a free SteamGridDB key'),
      tone: 'muted'
    })
  })

  it('asks the user to check a rejected key, as something to act on', () => {
    const line = coverStatusLine({ hasKey: true, problem: 'keyRejected' })
    expect(line.tone).toBe('danger')
    expect(line.text).toContain('Check it, or remove it')
  })

  it('treats SteamGridDB being unreachable as information, not an error', () => {
    const line = coverStatusLine({ hasKey: true, problem: 'unavailable' })
    expect(line.tone).toBe('muted')
    expect(line.text).toContain('Covers you already have still show')
  })

  it('stays quiet when everything works', () => {
    expect(coverStatusLine({ hasKey: true, problem: null })).toEqual({
      text: 'Epic covers come from SteamGridDB.',
      tone: 'muted'
    })
  })
})

describe('shouldShowKeyForm', () => {
  it('shows the form without a key or with a rejected one, and hides it otherwise', () => {
    expect(shouldShowKeyForm({ hasKey: false, problem: null })).toBe(true)
    expect(shouldShowKeyForm({ hasKey: true, problem: 'keyRejected' })).toBe(true)
    expect(shouldShowKeyForm({ hasKey: true, problem: 'unavailable' })).toBe(false)
    expect(shouldShowKeyForm({ hasKey: true, problem: null })).toBe(false)
  })
})

describe('coverKeyMessage', () => {
  it.each(['invalidKey', 'cannotStore', 'removeFailed', 'failed'] as const)(
    'gives a friendly sentence for %s',
    (problem) => {
      const message = coverKeyMessage(problem)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toMatch(/error|invoke|remote method/i)
    }
  )
})

describe('showCoverKeyRejectedNotice', () => {
  it('shows only for a saved key that SteamGridDB turned down', () => {
    expect(showCoverKeyRejectedNotice({ hasKey: true, problem: 'keyRejected' })).toBe(true)
  })

  it("doesn't nag about a missing key, an outage, or a status not read yet", () => {
    expect(showCoverKeyRejectedNotice({ hasKey: false, problem: null })).toBe(false)
    expect(showCoverKeyRejectedNotice({ hasKey: true, problem: 'unavailable' })).toBe(false)
    expect(showCoverKeyRejectedNotice({ hasKey: true, problem: null })).toBe(false)
    expect(showCoverKeyRejectedNotice(null)).toBe(false)
  })

  it('points to Settings, where the form is', () => {
    expect(COVER_KEY_REJECTED_NOTICE).toContain('in Settings')
  })
})
