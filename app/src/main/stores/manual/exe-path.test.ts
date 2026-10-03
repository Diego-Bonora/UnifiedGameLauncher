import { describe, expect, it } from 'vitest'
import {
  isSamePath,
  resolveExePath,
  hasExeExtension,
  isExeFile,
  suggestedTitle,
  type ExePathDeps
} from './exe-path'

function fakeFs(files: Record<string, string>, folders: string[] = []): ExePathDeps {
  return {
    stat: async (path) => {
      if (folders.includes(path)) return { isFile: () => false }
      if (path in files) return { isFile: () => true }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    realpath: async (path) => {
      const real = files[path]
      if (real === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return real
    }
  }
}

describe('hasExeExtension', () => {
  it('accepts .exe in any case and nothing else', () => {
    expect(hasExeExtension('C:\\Games\\Doom.exe')).toBe(true)
    expect(hasExeExtension('C:\\Games\\DOOM.EXE')).toBe(true)
    for (const path of [
      'C:\\Doom.lnk',
      'C:\\run.bat',
      'C:\\run.cmd',
      'C:\\Doom.exe.txt',
      'C:\\Doomexe'
    ]) {
      expect(hasExeExtension(path)).toBe(false)
    }
  })
})

describe('isExeFile', () => {
  const fs = fakeFs({ 'C:\\Games\\Doom.exe': 'C:\\Games\\Doom.exe' }, ['C:\\Games\\Folder.exe'])

  it('needs an existing file ending in .exe', async () => {
    expect(await isExeFile('C:\\Games\\Doom.exe', fs)).toBe(true)
    expect(await isExeFile('C:\\Games\\Gone.exe', fs)).toBe(false)
    expect(await isExeFile('C:\\Games\\Folder.exe', fs)).toBe(false)
  })
})

describe('resolveExePath', () => {
  it("gives Windows' own path for a short name or another spelling", async () => {
    const fs = fakeFs({ 'C:\\GAMES~1\\Doom.exe': 'C:\\Games\\Doom.exe' })
    expect(await resolveExePath('C:\\GAMES~1\\Doom.exe', fs)).toBe('C:\\Games\\Doom.exe')
  })

  it('keeps the picked spelling when it cannot be resolved', async () => {
    expect(await resolveExePath('D:\\Doom.exe', fakeFs({}))).toBe('D:\\Doom.exe')
  })
})

describe('isSamePath', () => {
  it('ignores case and slash direction, as Windows does', () => {
    expect(isSamePath('C:\\Games\\Doom.exe', 'c:/games/DOOM.EXE')).toBe(true)
    expect(isSamePath('C:\\Games\\Doom.exe', 'C:\\Games\\Doom2.exe')).toBe(false)
  })
})

describe('suggestedTitle', () => {
  it('is the file name without .exe', () => {
    expect(suggestedTitle('C:\\Games\\Hollow Knight\\hollow_knight.exe')).toBe('hollow_knight')
    expect(suggestedTitle('C:\\Games\\DOOM.EXE')).toBe('DOOM')
  })
})
