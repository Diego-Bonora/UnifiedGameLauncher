import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchEpicGame, listEpicInstalledGames, planEpicLaunch } from './epic-handlers'
import type { InstalledGame, StoreProvider } from '../stores/store-provider'

function fakeProvider(games: InstalledGame[], launchUrl?: string): StoreProvider {
  return {
    store: 'epic',
    getInstalledGames: async () => games,
    getLaunchUrl: (id) =>
      launchUrl ?? `com.epicgames.launcher://apps/${id}?action=launch&silent=true`
  }
}

const alpha: InstalledGame = {
  storeGameId: 'Alpha',
  title: 'Alpha Game',
  installPath: 'C:\\Games\\Alpha',
  catalogNamespace: 'ns',
  catalogItemId: 'id'
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listEpicInstalledGames', () => {
  it('maps detected games to the renderer shape, without catalog ids', async () => {
    await expect(listEpicInstalledGames(fakeProvider([alpha]))).resolves.toEqual([
      { appName: 'Alpha', title: 'Alpha Game', installPath: 'C:\\Games\\Alpha' }
    ])
  })

  it('drops a malformed entry with a warning and keeps the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad: InstalledGame = { ...alpha, storeGameId: 'no good/id' }
    const games = await listEpicInstalledGames(fakeProvider([bad, alpha]))
    expect(games.map((g) => g.appName)).toEqual(['Alpha'])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('listEpicInstalledGames failure', () => {
  it('returns an empty list, not a rejection, when detection throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider: StoreProvider = {
      ...fakeProvider([]),
      getInstalledGames: async () => {
        throw new Error('boom')
      }
    }
    await expect(listEpicInstalledGames(provider)).resolves.toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('planEpicLaunch', () => {
  it('returns the launch URL for an installed game', async () => {
    await expect(planEpicLaunch(fakeProvider([alpha]), { appName: 'Alpha' })).resolves.toEqual({
      url: 'com.epicgames.launcher://apps/Alpha?action=launch&silent=true'
    })
  })

  it('reports notInstalled, as data, for a well-formed id that was not detected', async () => {
    await expect(planEpicLaunch(fakeProvider([alpha]), { appName: 'Other' })).resolves.toEqual({
      notInstalled: true
    })
  })

  it('throws for a malformed payload (a caller bug)', async () => {
    const provider = fakeProvider([alpha])
    for (const bad of [
      null,
      undefined,
      {},
      { appName: 42 },
      { appName: '' },
      { appName: 'a/b' },
      { appName: 'a?b=1' },
      { appName: 'Alpha\n' },
      { appName: 'x'.repeat(101) },
      'Alpha'
    ]) {
      await expect(planEpicLaunch(provider, bad)).rejects.toThrow()
    }
  })

  it('ignores extra fields in the payload', async () => {
    const plan = await planEpicLaunch(fakeProvider([alpha]), {
      appName: 'Alpha',
      url: 'https://evil.example'
    })
    expect(plan).toEqual({
      url: 'com.epicgames.launcher://apps/Alpha?action=launch&silent=true'
    })
  })

  it('refuses a URL outside the allow-list even for an installed game', async () => {
    const provider = fakeProvider([alpha], 'https://evil.example/')
    await expect(planEpicLaunch(provider, { appName: 'Alpha' })).rejects.toThrow(
      'This game cannot be launched right now.'
    )
  })
})

describe('launchEpicGame', () => {
  const request = { appName: 'Alpha' }

  it('opens the launch URL and reports launched', async () => {
    const opened: string[] = []
    const result = await launchEpicGame(fakeProvider([alpha]), request, async (url) => {
      opened.push(url)
    })
    expect(result).toEqual({ launched: true })
    expect(opened).toEqual(['com.epicgames.launcher://apps/Alpha?action=launch&silent=true'])
  })

  it('reports notInstalled and opens nothing for an undetected game', async () => {
    const openExternal = vi.fn(async () => {})
    const result = await launchEpicGame(fakeProvider([]), request, openExternal)
    expect(result).toEqual({ launched: false, reason: 'notInstalled' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('reports launcherUnavailable, as data, when the OS cannot open the protocol', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await launchEpicGame(fakeProvider([alpha]), request, async () => {
      throw new Error('No application is associated with the URL')
    })
    expect(result).toEqual({ launched: false, reason: 'launcherUnavailable' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports notInstalled, without opening anything, when detection throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const openExternal = vi.fn(async () => {})
    const provider: StoreProvider = {
      ...fakeProvider([alpha]),
      getInstalledGames: async () => {
        throw new Error('boom')
      }
    }
    const result = await launchEpicGame(provider, request, openExternal)
    expect(result).toEqual({ launched: false, reason: 'notInstalled' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('still throws for a malformed payload', async () => {
    const openExternal = vi.fn(async () => {})
    await expect(
      launchEpicGame(fakeProvider([alpha]), { appName: 'a/b' }, openExternal)
    ).rejects.toThrow()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
