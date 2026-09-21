import { describe, expect, it } from 'vitest'
import { epicLaunchMessage, type EpicLaunchProblem } from './epic-launch-messages'

const problems: EpicLaunchProblem[] = ['notInstalled', 'launcherUnavailable', 'failed']

describe('epicLaunchMessage', () => {
  it('has a distinct, non-empty message for every problem', () => {
    const messages = problems.map(epicLaunchMessage)
    expect(messages.every((message) => message.length > 0)).toBe(true)
    expect(new Set(messages).size).toBe(problems.length)
  })

  it('never leaks raw error wording', () => {
    for (const problem of problems) {
      expect(epicLaunchMessage(problem)).not.toMatch(/error|invoking|exception|ENOENT|undefined/i)
    }
  })

  it('tells the user what to do when the launcher cannot be opened', () => {
    expect(epicLaunchMessage('launcherUnavailable')).toMatch(/make sure it's installed/i)
  })
})
