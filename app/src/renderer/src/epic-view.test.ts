import { describe, expect, it } from 'vitest'
import type { EpicInstalledGame } from '@shared/ipc/epic-channels'
import { feedbackForLaunch, nextEpicGames, sortEpicGames } from './epic-view'

const game = (title: string): EpicInstalledGame => ({
  appName: title.replace(/\s/g, ''),
  title,
  installPath: `C:\\Games\\${title}`
})

describe('sortEpicGames', () => {
  it('sorts by title without changing the input', () => {
    const input = [game('Zed'), game('alpha'), game('Beta')]
    expect(sortEpicGames(input).map((g) => g.title)).toEqual(['alpha', 'Beta', 'Zed'])
    expect(input.map((g) => g.title)).toEqual(['Zed', 'alpha', 'Beta'])
  })
})

describe('nextEpicGames', () => {
  const shown = [game('Alpha'), game('Beta')]

  it('shows a successful read, sorted', () => {
    expect(nextEpicGames(shown, [game('Zed'), game('Cat')]).map((g) => g.title)).toEqual([
      'Cat',
      'Zed'
    ])
  })

  it('keeps the games on screen when a refresh fails', () => {
    expect(nextEpicGames(shown, 'failed')).toBe(shown)
  })

  it('shows nothing when the very first read fails', () => {
    expect(nextEpicGames(null, 'failed')).toEqual([])
  })

  it('accepts an empty successful read (everything was uninstalled)', () => {
    expect(nextEpicGames(shown, [])).toEqual([])
  })
})

describe('feedbackForLaunch', () => {
  it('reports progress, not silence, after a successful hand-off', () => {
    expect(feedbackForLaunch('Fortnite', { launched: true })).toEqual({
      message: 'Starting Fortnite…',
      tone: 'info',
      refreshList: false
    })
  })

  it('asks for a list refresh only when the game is no longer installed', () => {
    const gone = feedbackForLaunch('X', { launched: false, reason: 'notInstalled' })
    expect(gone.tone).toBe('danger')
    expect(gone.refreshList).toBe(true)

    const noLauncher = feedbackForLaunch('X', { launched: false, reason: 'launcherUnavailable' })
    expect(noLauncher.tone).toBe('danger')
    expect(noLauncher.refreshList).toBe(false)
  })

  it('treats a broken launch call as a friendly danger message', () => {
    const feedback = feedbackForLaunch('X', 'failed')
    expect(feedback.tone).toBe('danger')
    expect(feedback.message).not.toMatch(/error|invoking|exception/i)
    expect(feedback.refreshList).toBe(false)
  })
})
