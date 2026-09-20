import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, isSameOrigin } from './external-url'

describe('isSameOrigin', () => {
  it('matches the same origin regardless of path', () => {
    expect(isSameOrigin('http://localhost:5173/index.html', 'http://localhost:5173')).toBe(true)
  })

  it('rejects lookalike hosts and other ports', () => {
    expect(isSameOrigin('http://localhost:5173.evil.com/', 'http://localhost:5173')).toBe(false)
    expect(isSameOrigin('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isSameOrigin('nonsense', 'http://localhost:5173')).toBe(false)
  })
})

describe('isAllowedExternalUrl', () => {
  it('allows the store launcher protocols', () => {
    expect(isAllowedExternalUrl('steam://rungameid/440')).toBe(true)
    expect(
      isAllowedExternalUrl('com.epicgames.launcher://apps/abc?action=launch&silent=true')
    ).toBe(true)
  })

  it('rejects web, file and other protocols', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(false)
    expect(isAllowedExternalUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isAllowedExternalUrl('ms-msdt:/id PCWDiagnostic')).toBe(false)
  })

  it('rejects garbage and lookalikes', () => {
    expect(isAllowedExternalUrl('')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('steamx://rungameid/440')).toBe(false)
  })
})
