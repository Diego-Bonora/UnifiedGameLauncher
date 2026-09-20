import { describe, expect, it } from 'vitest'
import { parseAppManifest } from './app-manifest'

describe('parseAppManifest', () => {
  it('extracts appId, title and installDir', () => {
    const text = `
      "AppState"
      {
        "appid"		"440"
        "Universe"		"1"
        "name"		"Team Fortress 2"
        "StateFlags"		"4"
        "installdir"		"Team Fortress 2"
      }
    `
    expect(parseAppManifest(text)).toEqual({
      appId: '440',
      title: 'Team Fortress 2',
      installDir: 'Team Fortress 2'
    })
  })

  it('returns null when a required field is missing', () => {
    const text = `
      "AppState"
      {
        "appid"		"440"
      }
    `
    expect(parseAppManifest(text)).toBeNull()
  })

  it('returns null for a file with no AppState block', () => {
    expect(parseAppManifest('"something else" { }')).toBeNull()
    expect(parseAppManifest('')).toBeNull()
    expect(parseAppManifest('garbage')).toBeNull()
  })
})
