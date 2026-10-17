import { describe, expect, it } from 'vitest'
import { apiKeyProblemText, disconnectProblemText, signInProblemText } from './steam-messages'

describe('signInProblemText', () => {
  it('words each sign-in problem with what to do next', () => {
    expect(signInProblemText('verifyFailed')).toMatch(/verify.*try again/)
    expect(signInProblemText('cannotSave')).toMatch(/could not save.*try again/)
    expect(signInProblemText('failed')).toMatch(/try again/)
  })
})

describe('apiKeyProblemText', () => {
  it('says what a Steam Web API key looks like', () => {
    expect(apiKeyProblemText('invalidKey')).toContain('32 letters and numbers')
  })

  it('words a save or removal that broke outright', () => {
    expect(apiKeyProblemText('failed')).toMatch(/save.*try again/)
    expect(apiKeyProblemText('removeFailed')).toMatch(/remove.*try again/)
  })

  it('says the key could not be stored, not that it is wrong', () => {
    expect(apiKeyProblemText('cannotStore')).toMatch(/can't securely store/)
  })
})

describe('disconnectProblemText', () => {
  it('says the user is still connected and can try again', () => {
    expect(disconnectProblemText('removeFailed')).toMatch(/still connected.*try again/)
    expect(disconnectProblemText('failed')).toMatch(/try again/)
  })
})
