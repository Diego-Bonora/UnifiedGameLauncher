import { describe, expect, it } from 'vitest'
import { parseLibraryFolders } from './library-folders'

describe('parseLibraryFolders', () => {
  it('collects the path of every numbered library entry', () => {
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
        "1"
        {
          "path"		"D:\\\\SteamLibrary"
          "apps"
          {
            "570"		"987654321"
          }
        }
      }
    `
    expect(parseLibraryFolders(text)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary'
    ])
  })

  it('returns an empty list when there is no libraryfolders block', () => {
    expect(parseLibraryFolders('')).toEqual([])
    expect(parseLibraryFolders('"something else" { }')).toEqual([])
  })

  it('skips entries with no path', () => {
    const text = `
      "libraryfolders"
      {
        "0"
        {
          "apps" { }
        }
      }
    `
    expect(parseLibraryFolders(text)).toEqual([])
  })
})
