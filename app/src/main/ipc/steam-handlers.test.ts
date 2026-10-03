import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { handOffToSteam, libraryKey, listSteamInstalledGames } from './steam-handlers'
import type { StoreProvider } from '../stores/store-provider'
import type { SteamInstallScan } from '../stores/steam'

const tf2 = { storeGameId: '440', title: 'Team Fortress 2', installPath: 'C:\\Steam\\common\\TF2' }
const dota = { storeGameId: '570', title: 'Dota 2', installPath: 'D:\\Lib\\common\\dota' }

function fakeSteam(overrides: Partial<StoreProvider> = {}): StoreProvider {
  return {
    store: 'steam',
    getInstalledGames: async () => [],
    getLaunchUrl: (id) => `steam://rungameid/${id}`,
    getInstallUrl: (id) => `steam://install/${id}`,
    ...overrides
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listSteamInstalledGames', () => {
  it('tags each game with its library and names the unreadable ones', async () => {
    const scan: SteamInstallScan = {
      libraries: [
        { path: 'C:\\Steam', readable: true, games: [tf2] },
        { path: 'D:\\Lib', readable: true, games: [dota] },
        { path: 'E:\\Asleep', readable: false, games: [] }
      ],
      libraryListReadable: true
    }

    await expect(listSteamInstalledGames(async () => scan)).resolves.toEqual({
      games: [
        {
          appId: '440',
          title: 'Team Fortress 2',
          installPath: tf2.installPath,
          libraryPath: 'c:\\steam',
          coverUrl: null
        },
        {
          appId: '570',
          title: 'Dota 2',
          installPath: dota.installPath,
          libraryPath: 'd:\\lib',
          coverUrl: null
        }
      ],
      unreadableLibraries: ['e:\\asleep'],
      libraryListReadable: true
    })
  })

  it('passes on an unreadable library list', async () => {
    const result = await listSteamInstalledGames(async () => ({
      libraries: [{ path: 'C:\\Steam', readable: true, games: [tf2] }],
      libraryListReadable: false
    }))
    expect(result.libraryListReadable).toBe(false)
    expect(result.games).toHaveLength(1)
  })

  it('drops a malformed game but keeps the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await listSteamInstalledGames(async () => ({
      libraries: [
        { path: 'C:\\Steam', readable: true, games: [{ ...dota, storeGameId: 'abc' }, tf2] }
      ],
      libraryListReadable: true
    }))
    expect(result.games.map((game) => game.appId)).toEqual(['440'])
  })

  it('reports "nothing seen" instead of "no games" when the scan breaks', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // Never an empty, complete list: that would make every game look
    // uninstalled.
    await expect(
      listSteamInstalledGames(async () => {
        throw new Error('boom')
      })
    ).resolves.toEqual({ games: [], unreadableLibraries: [], libraryListReadable: false })
  })
})

describe('listSteamInstalledGames covers', () => {
  const scan = async (readable = true): Promise<SteamInstallScan> => ({
    libraries: [
      { path: 'C:\\Steam', readable: true, games: [tf2] },
      { path: 'D:\\Lib', readable, games: readable ? [dota] : [] }
    ],
    libraryListReadable: true
  })

  it('attaches saved covers and reports the listed games as complete', async () => {
    const onListed = vi.fn()
    const result = await listSteamInstalledGames(() => scan(), {
      urlsFor: async () => new Map([['570', 'app-cover://covers/570']]),
      onListed
    })
    expect(result.games.map((game) => game.coverUrl)).toEqual([null, 'app-cover://covers/570'])
    expect(onListed).toHaveBeenCalledWith(['440', '570'])
  })

  it('still lists every game when saved covers cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await listSteamInstalledGames(() => scan(), {
      urlsFor: async () => {
        throw new Error('EBUSY')
      },
      onListed: () => undefined
    })
    expect(result.games.map((game) => game.coverUrl)).toEqual([null, null])
  })

  it('does not report anything when the scan itself broke', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const onListed = vi.fn()
    await listSteamInstalledGames(
      async () => {
        throw new Error('boom')
      },
      { urlsFor: async () => new Map(), onListed }
    )
    // The cover cleanup keeps relying on the last real read.
    expect(onListed).not.toHaveBeenCalled()
  })
})

describe('libraryKey', () => {
  it('spells the same Windows folder the same way however Steam wrote it', () => {
    const key = libraryKey('C:\\Program Files (x86)\\Steam')
    expect(libraryKey('c:/program files (x86)/steam')).toBe(key)
    expect(libraryKey('C:\\Program Files (x86)\\Steam\\')).toBe(key)
    expect(libraryKey('c:/program files (x86)/steam/')).toBe(key)
  })

  it('keeps different folders apart', () => {
    expect(libraryKey('D:\\SteamLibrary')).not.toBe(libraryKey('D:\\SteamLibrary2'))
  })
})

describe('listSteamInstalledGames library matching', () => {
  it('matches a library across two reads that spell it differently', async () => {
    const first = await listSteamInstalledGames(async () => ({
      libraries: [{ path: 'C:\\Program Files (x86)\\Steam', readable: true, games: [tf2] }],
      libraryListReadable: true
    }))
    const second = await listSteamInstalledGames(async () => ({
      libraries: [{ path: 'c:/program files (x86)/steam', readable: false, games: [] }],
      libraryListReadable: false
    }))
    expect(second.unreadableLibraries).toEqual([first.games[0]?.libraryPath])
  })
})

describe('handOffToSteam', () => {
  it('opens the launch URL and reports it accepted', async () => {
    const openExternal = vi.fn(async () => undefined)
    await expect(
      handOffToSteam('launch', fakeSteam(), { appId: '440' }, openExternal)
    ).resolves.toEqual({ accepted: true })
    expect(openExternal).toHaveBeenCalledWith('steam://rungameid/440')
  })

  it('opens the install URL for an install', async () => {
    const openExternal = vi.fn(async () => undefined)
    await expect(
      handOffToSteam('install', fakeSteam(), { appId: '570' }, openExternal)
    ).resolves.toEqual({ accepted: true })
    expect(openExternal).toHaveBeenCalledWith('steam://install/570')
  })

  it('returns steamUnavailable as data when Windows has no steam:// handler', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const openExternal = vi.fn(async () => {
      throw new Error('No application is associated with the specified file')
    })
    await expect(
      handOffToSteam('install', fakeSteam(), { appId: '570' }, openExternal)
    ).resolves.toEqual({ accepted: false, reason: 'steamUnavailable' })
  })

  it.each([{ appId: '440/../x' }, { appId: '' }, { appId: 440 }, null, 'steam://install/1'])(
    'rejects a malformed request %j without opening anything',
    async (request) => {
      const openExternal = vi.fn(async () => undefined)
      await expect(
        handOffToSteam('install', fakeSteam(), request, openExternal)
      ).rejects.toBeInstanceOf(ZodError)
      expect(openExternal).not.toHaveBeenCalled()
    }
  )

  it('refuses a URL outside the allow-list without opening it', async () => {
    const openExternal = vi.fn(async () => undefined)
    const provider = fakeSteam({ getLaunchUrl: () => 'https://example.com/' })
    await expect(
      handOffToSteam('launch', provider, { appId: '440' }, openExternal)
    ).rejects.toThrow()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('refuses an install for a store that has no install URL', async () => {
    const openExternal = vi.fn(async () => undefined)
    const provider = fakeSteam({ getInstallUrl: undefined })
    await expect(
      handOffToSteam('install', provider, { appId: '440' }, openExternal)
    ).rejects.toThrow()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
