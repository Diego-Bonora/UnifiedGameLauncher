import { afterEach, describe, expect, it, vi } from 'vitest'
import { epicProvider, getInstalledEpicGames, type EpicFsDeps } from './epic-provider'
import { isAllowedExternalUrl } from '../../security/external-url'

function item(appName: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    AppName: appName,
    DisplayName: `Game ${appName}`,
    InstallLocation: `C:/Games/${appName}`,
    MainGameAppName: '',
    AppCategories: ['games'],
    CatalogNamespace: 'ns',
    CatalogItemId: `id${appName}`,
    ...extra
  })
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? ''
}

// Matches on the exact file name, so 'a.item' can never satisfy 'xa.item'.
function fakeFs(files: Record<string, string>): EpicFsDeps {
  return {
    readdir: async () => Object.keys(files),
    readFile: async (path) => {
      const text = files[baseName(path)]
      if (text === undefined) throw new Error('ENOENT')
      return text
    }
  }
}

describe('getInstalledEpicGames', () => {
  // In afterEach so a failed assertion can't leave a console spy behind.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns one game per valid manifest, with catalog ids', async () => {
    const games = await getInstalledEpicGames(
      'M',
      fakeFs({ 'a.item': item('Alpha'), 'b.item': item('Beta') })
    )
    expect(games).toEqual([
      {
        storeGameId: 'Alpha',
        title: 'Game Alpha',
        installPath: 'C:\\Games\\Alpha',
        catalogNamespace: 'ns',
        catalogItemId: 'idAlpha'
      },
      {
        storeGameId: 'Beta',
        title: 'Game Beta',
        installPath: 'C:\\Games\\Beta',
        catalogNamespace: 'ns',
        catalogItemId: 'idBeta'
      }
    ])
  })

  it('returns an empty list, without warning, when the manifests folder does not exist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fs: EpicFsDeps = {
      readdir: async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      },
      readFile: async () => ''
    }
    await expect(getInstalledEpicGames('M', fs)).resolves.toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when the folder cannot be read for a reason other than not existing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fs: EpicFsDeps = {
      readdir: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      },
      readFile: async () => ''
    }
    await expect(getInstalledEpicGames('M', fs)).resolves.toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('accepts an upper-case .ITEM extension', async () => {
    const games = await getInstalledEpicGames('M', fakeFs({ 'A.ITEM': item('Alpha') }))
    expect(games).toHaveLength(1)
  })

  it('ignores non-.item files, DLC, non-games and incomplete installs quietly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const games = await getInstalledEpicGames(
      'M',
      fakeFs({
        'notes.txt': item('Nope'),
        'dlc.item': item('Dlc', { MainGameAppName: 'Alpha' }),
        'engine.item': item('UE_5.3', { AppCategories: ['applications'] }),
        'half.item': item('Half', { bIsIncompleteInstall: true }),
        'ok.item': item('Alpha')
      })
    )
    expect(games.map((g) => g.storeGameId)).toEqual(['Alpha'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns about a corrupt or unsafe manifest and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const games = await getInstalledEpicGames(
      'M',
      fakeFs({
        'bad.item': '{oops',
        'unc.item': item('Unc', { InstallLocation: '\\\\host\\share\\Unc' }),
        'ok.item': item('Alpha')
      })
    )
    expect(games.map((g) => g.storeGameId)).toEqual(['Alpha'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('skips an unreadable file without dropping the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fs: EpicFsDeps = {
      readdir: async () => ['locked.item', 'ok.item'],
      readFile: async (path) => {
        if (baseName(path) === 'locked.item') throw new Error('EPERM')
        return item('Alpha')
      }
    }
    const games = await getInstalledEpicGames('M', fs)
    expect(games.map((g) => g.storeGameId)).toEqual(['Alpha'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('de-dupes the same AppName listed by two manifests', async () => {
    const games = await getInstalledEpicGames(
      'M',
      fakeFs({ 'a.item': item('Alpha'), 'b.item': item('Alpha') })
    )
    expect(games).toHaveLength(1)
  })
})

describe('epicProvider.getLaunchUrl', () => {
  it('builds a URL the external-url allow-list accepts', () => {
    const url = epicProvider.getLaunchUrl('Alpha')
    expect(url).toBe('com.epicgames.launcher://apps/Alpha?action=launch&silent=true')
    expect(isAllowedExternalUrl(url)).toBe(true)
  })

  it('encodes the id so it cannot change the URL structure', () => {
    const url = epicProvider.getLaunchUrl('a/b?c')
    expect(url).not.toContain('a/b?c')
    expect(isAllowedExternalUrl(url)).toBe(true)
  })
})
