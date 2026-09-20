import { describe, expect, it } from 'vitest'
import { parseVdf } from './vdf'

describe('parseVdf', () => {
  it('parses flat key-value pairs', () => {
    const text = `
      "AppState"
      {
        "appid"		"440"
        "name"		"Team Fortress 2"
      }
    `
    expect(parseVdf(text)).toEqual({
      AppState: { appid: '440', name: 'Team Fortress 2' }
    })
  })

  it('parses nested objects at arbitrary depth', () => {
    const text = `
      "libraryfolders"
      {
        "0"
        {
          "path"		"C:\\\\Program Files (x86)\\\\Steam"
          "apps"
          {
            "440"		"123456789"
          }
        }
      }
    `
    const result = parseVdf(text)
    const libraryFolders = result['libraryfolders'] as Record<string, unknown>
    const zero = libraryFolders['0'] as Record<string, unknown>
    expect(zero['path']).toBe('C:\\Program Files (x86)\\Steam')
    expect(zero['apps']).toEqual({ '440': '123456789' })
  })

  it('unescapes quotes and skips line comments', () => {
    const text = `
      // a comment line
      "key"		"a \\"quoted\\" value"
    `
    expect(parseVdf(text)).toEqual({ key: 'a "quoted" value' })
  })

  it('returns an empty object for empty or malformed input', () => {
    expect(parseVdf('')).toEqual({})
    expect(parseVdf('not valid vdf at all')).toEqual({})
  })
})
