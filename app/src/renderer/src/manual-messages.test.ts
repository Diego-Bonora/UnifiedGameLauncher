import { describe, expect, it } from 'vitest'
import type { ManualChangeFailure } from '@shared/ipc/manual-channels'
import {
  argsProblem,
  changeFailed,
  changeSucceeded,
  pickMessage,
  titleProblem,
  type ManualAction
} from './manual-messages'

const RAW = /error|invoking|exception|ENOENT|undefined|null/i
const ACTIONS: ManualAction[] = ['add', 'rename', 'args', 'changeExe', 'remove']
const FAILURES: (ManualChangeFailure | 'failed')[] = [
  'notConfirmed',
  'cancelled',
  'noPick',
  'notExe',
  'duplicate',
  'notFound',
  'unreadable',
  'cannotSave',
  'busy',
  'failed'
]

describe('pickMessage', () => {
  it('says nothing when the picker was closed or worked', () => {
    expect(pickMessage({ picked: false, reason: 'cancelled' })).toBeNull()
    expect(pickMessage({ picked: true, suggestedTitle: 'Doom' })).toBeNull()
  })

  it('explains every other outcome without raw text', () => {
    for (const reason of ['notExe', 'duplicate', 'unreadable', 'busy'] as const) {
      const message = pickMessage({ picked: false, reason })
      expect(message?.tone).toBe('danger')
      expect(message?.text).not.toMatch(RAW)
    }
  })
})

describe('change messages', () => {
  it('confirms every successful change by name', () => {
    for (const action of ACTIONS) {
      const outcome = changeSucceeded(action, 'Doom')
      expect(outcome.message?.text).toContain('Doom')
      expect(outcome.stayOpen).toBe(false)
    }
  })

  it('never shows raw text for any failure', () => {
    for (const action of ACTIONS) {
      for (const reason of FAILURES) {
        expect(changeFailed(action, reason, 'Doom').message?.text ?? '').not.toMatch(RAW)
      }
    }
  })

  it('keeps the form open when the user can fix it there', () => {
    expect(changeFailed('add', 'notConfirmed', 'Doom').stayOpen).toBe(true)
    expect(changeFailed('args', 'notConfirmed', 'Doom').stayOpen).toBe(true)
    expect(changeFailed('rename', 'cannotSave', 'Doom').stayOpen).toBe(true)
    expect(changeFailed('add', 'noPick', 'Doom').stayOpen).toBe(false)
    expect(changeFailed('remove', 'cannotSave', 'Doom').stayOpen).toBe(false)
  })

  it('stays quiet when the user closed the file picker', () => {
    expect(changeFailed('changeExe', 'cancelled', 'Doom').message).toBeNull()
  })

  it('reassures that removing never deletes files', () => {
    expect(changeSucceeded('remove', 'Doom').message?.text).toMatch(/files .* weren't touched/)
  })
})

describe('form checks', () => {
  it('needs a title of 1 to 200 characters', () => {
    expect(titleProblem('  ')).toBe('Enter a title.')
    expect(titleProblem('x'.repeat(201))).toMatch(/200/)
    expect(titleProblem('  Doom  ')).toBeNull()
  })

  it('accepts real writing in titles but not direction overrides', () => {
    expect(titleProblem('Pokémon™ ポケモン')).toBeNull()
    expect(titleProblem('می\u200cخواهم')).toBeNull()
    expect(titleProblem('Doom\u202e')).toMatch(/hidden/)
  })

  it('allows empty arguments, and refuses line breaks or hidden characters', () => {
    expect(argsProblem('')).toBeNull()
    expect(argsProblem('-config="C:\\My Games\\a.ini" -windowed')).toBeNull()
    expect(argsProblem('-a\n-b')).toMatch(/visible/)
    expect(argsProblem('-a\u200b')).toMatch(/visible/)
    expect(argsProblem('x'.repeat(1001))).toMatch(/1000/)
  })
})
