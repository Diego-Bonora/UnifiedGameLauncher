import { describe, expect, it } from 'vitest'
import type { ManualLaunchFailure } from '@shared/ipc/manual-channels'
import { manualLaunchMessage } from './manual-launch-messages'

const RAW = /error|invoking|exception|ENOENT|EACCES|undefined/i

describe('manualLaunchMessage', () => {
  it.each<ManualLaunchFailure>(['notFound', 'missing', 'refused', 'unreadable', 'failed'])(
    'names the game and never shows raw error text (%s)',
    (problem) => {
      const message = manualLaunchMessage(problem, 'Hades')
      expect(message).toContain('Hades')
      expect(message).not.toMatch(RAW)
    }
  )

  it('points a missing .exe to Change .exe, and a refusal to running as administrator', () => {
    expect(manualLaunchMessage('missing', 'Hades')).toMatch(/Change \.exe/)
    expect(manualLaunchMessage('refused', 'Hades')).toMatch(/administrator/)
  })
})
