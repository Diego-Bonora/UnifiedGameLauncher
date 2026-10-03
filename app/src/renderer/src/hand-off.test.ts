import { describe, expect, it } from 'vitest'
import { handOffFeedback } from './hand-off'

const steamGame = { store: 'steam' as const, title: 'Dota 2' }
const epicGame = { store: 'epic' as const, title: 'Fortnite' }
const RAW = /error|invoking|exception|ENOENT|undefined/i

describe('handOffFeedback', () => {
  it('reports progress, not silence, after a successful hand-off', () => {
    expect(handOffFeedback(epicGame, 'launch', { accepted: true })).toEqual({
      message: 'Starting Fortnite…',
      tone: 'info',
      refreshList: false
    })
    expect(handOffFeedback(steamGame, 'install', { accepted: true })).toEqual({
      message: 'Opening Steam to install Dota 2…',
      tone: 'info',
      refreshList: false
    })
  })

  it('tells the user what to do when Steam cannot be opened', () => {
    const feedback = handOffFeedback(steamGame, 'install', {
      accepted: false,
      reason: 'steamUnavailable'
    })
    expect(feedback.tone).toBe('danger')
    expect(feedback.message).toMatch(/make sure it's installed/i)
    expect(feedback.refreshList).toBe(false)
  })

  it('asks for a list refresh only when an Epic game is no longer installed', () => {
    const gone = handOffFeedback(epicGame, 'launch', { accepted: false, reason: 'notInstalled' })
    expect(gone.tone).toBe('danger')
    expect(gone.refreshList).toBe(true)

    const noLauncher = handOffFeedback(epicGame, 'launch', {
      accepted: false,
      reason: 'launcherUnavailable'
    })
    expect(noLauncher.tone).toBe('danger')
    expect(noLauncher.refreshList).toBe(false)
  })

  it('words a broken call per kind, without raw error text', () => {
    const launch = handOffFeedback(steamGame, 'launch', 'failed')
    const install = handOffFeedback(steamGame, 'install', 'failed')
    expect(launch.tone).toBe('danger')
    expect(install.tone).toBe('danger')
    expect(launch.message).not.toBe(install.message)
    expect(launch.message).not.toMatch(RAW)
    expect(install.message).not.toMatch(RAW)
  })
})
