import { beforeEach, describe, expect, it, vi } from 'vitest'

// Handlers are captured as registerSteamAuthIpc() runs, then invoked directly
// by channel name — no real Electron process involved.
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    }
  }
}))

vi.mock('../stores/steam/openid', () => ({
  openSteamSignInInBrowser: vi.fn(),
  cancelSteamSignIn: vi.fn()
}))
// Keep the real SteamApiError so `instanceof` in the handler works; only the
// network call is replaced.
vi.mock('../stores/steam/owned-games', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stores/steam/owned-games')>()),
  getOwnedSteamGames: vi.fn()
}))
vi.mock('../storage/connection-store', () => ({
  getSteamConnection: vi.fn(),
  setSteamConnection: vi.fn(),
  clearSteamConnection: vi.fn()
}))
vi.mock('../storage/secret-store', () => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  clearSecret: vi.fn()
}))
vi.mock('../library/cover-cache', () => ({
  syncCovers: vi.fn(),
  clearCovers: vi.fn(),
  // Identity by default (set in beforeEach): these tests are about what the
  // handlers hand to the cover cache, not about the cache itself.
  withLocalCoverUrls: vi.fn()
}))
vi.mock('../library/library-cache', () => ({
  getCachedSteamLibrary: vi.fn(),
  setCachedSteamLibrary: vi.fn(),
  clearCachedSteamLibrary: vi.fn()
}))

import { STEAM_CHANNELS } from '@shared/ipc/steam'
import { registerSteamAuthIpc } from './steam-auth'
import { getOwnedSteamGames, SteamApiError } from '../stores/steam/owned-games'
import { clearSteamConnection, getSteamConnection } from '../storage/connection-store'
import { clearSecret, getSecret } from '../storage/secret-store'
import { clearCovers, syncCovers, withLocalCoverUrls } from '../library/cover-cache'
import {
  clearCachedSteamLibrary,
  getCachedSteamLibrary,
  setCachedSteamLibrary
} from '../library/library-cache'

const STEAM_ID = '76561197960287930'
const GAMES = [{ appId: '10', title: 'Counter-Strike', coverUrl: null }]

const live = (games: unknown): unknown => ({ source: 'live', games, problem: null })

function invoke(channel: string): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`no handler registered for ${channel}`)
  return handler({})
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.mocked(withLocalCoverUrls).mockImplementation(async (games) => games)
  vi.mocked(syncCovers).mockResolvedValue(undefined)
  vi.mocked(clearCovers).mockResolvedValue(undefined)
  handlers.clear()
  registerSteamAuthIpc()
})

function connectedWithKey(): void {
  vi.mocked(getSteamConnection).mockResolvedValue({ status: 'connected', steamId64: STEAM_ID })
  vi.mocked(getSecret).mockResolvedValue('a'.repeat(32))
}

describe('steam:getOwnedGames', () => {
  it('saves the live result to the cache and returns it', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(GAMES))
    expect(setCachedSteamLibrary).toHaveBeenCalledWith(STEAM_ID, GAMES)
  })

  it('starts cover downloads and returns local cover URLs where they exist', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    const local = [{ appId: '10', title: 'Counter-Strike', coverUrl: 'app-cover://covers/10' }]
    vi.mocked(withLocalCoverUrls).mockResolvedValue(local)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(local))
    expect(syncCovers).toHaveBeenCalledWith(GAMES)
  })

  it('does not wait for cover downloads before returning the library', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    // Never settles: if the handler awaited it, this test would time out.
    vi.mocked(syncCovers).mockReturnValue(new Promise(() => undefined))

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(GAMES))
  })

  it('still returns the live result when saving the cache fails', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockRejectedValue(new Error('disk full'))

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(GAMES))
  })

  it('does not touch the cache, covers, connection or API key when the fetch fails', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new Error('network down'))
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual({
      source: 'none',
      games: null,
      problem: 'unavailable'
    })
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCovers).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
    expect(clearSteamConnection).not.toHaveBeenCalled()
    expect(clearSecret).not.toHaveBeenCalled()
  })

  it('still throws when called without a connection or key (a caller bug, not a failure)', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue(null)

    await expect(invoke(STEAM_CHANNELS.getOwnedGames)).rejects.toThrow(
      'Connect Steam and add your Steam Web API key first.'
    )
  })
})

describe('steam:getOwnedGames when Steam answers with an empty library', () => {
  const SAVED = [{ appId: '10', title: 'Counter-Strike', coverUrl: null }]

  it('keeps a non-empty saved library instead of overwriting it', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue([])
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(SAVED)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual({
      source: 'cache',
      games: SAVED,
      problem: 'empty'
    })
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
  })

  it('takes an empty answer at face value when nothing is saved', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue([])
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live([]))
    expect(setCachedSteamLibrary).toHaveBeenCalledWith(STEAM_ID, [])
  })

  it('takes an empty answer at face value when the saved library is empty too', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue([])
    vi.mocked(getCachedSteamLibrary).mockResolvedValue([])
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live([]))
  })

  it('does not treat a non-empty answer as a problem', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(SAVED)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(GAMES))
  })
})

describe('steam:getOwnedGames overlapping calls', () => {
  it('shares one Steam request between calls that overlap', async () => {
    connectedWithKey()
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    let finish: (games: typeof GAMES) => void = () => undefined
    vi.mocked(getOwnedSteamGames).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )

    const first = invoke(STEAM_CHANNELS.getOwnedGames)
    const second = invoke(STEAM_CHANNELS.getOwnedGames)
    const third = invoke(STEAM_CHANNELS.getOwnedGames)
    await new Promise((resolve) => setTimeout(resolve, 0))
    finish(GAMES)

    expect(await Promise.all([first, second, third])).toEqual([
      live(GAMES),
      live(GAMES),
      live(GAMES)
    ])
    expect(getOwnedSteamGames).toHaveBeenCalledTimes(1)
    expect(syncCovers).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh request once the previous one has finished', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    await invoke(STEAM_CHANNELS.getOwnedGames)
    await invoke(STEAM_CHANNELS.getOwnedGames)

    expect(getOwnedSteamGames).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh request after a failed one', async () => {
    connectedWithKey()
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)
    vi.mocked(getOwnedSteamGames).mockRejectedValueOnce(new SteamApiError('offline', 'x'))
    vi.mocked(getOwnedSteamGames).mockResolvedValueOnce(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toMatchObject({ source: 'none' })
    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(live(GAMES))
  })

  it('does not join a request that was made with a different key', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'connected', steamId64: STEAM_ID })
    vi.mocked(getSecret).mockResolvedValueOnce('a'.repeat(32)).mockResolvedValueOnce('b'.repeat(32))
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    let finishFirst: (games: typeof GAMES) => void = () => undefined
    vi.mocked(getOwnedSteamGames)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve
        })
      )
      .mockResolvedValueOnce(GAMES)

    const first = invoke(STEAM_CHANNELS.getOwnedGames)
    const second = invoke(STEAM_CHANNELS.getOwnedGames)
    await second
    finishFirst(GAMES)
    await first

    expect(getOwnedSteamGames).toHaveBeenCalledTimes(2)
    expect(getOwnedSteamGames).toHaveBeenNthCalledWith(1, STEAM_ID, 'a'.repeat(32))
    expect(getOwnedSteamGames).toHaveBeenNthCalledWith(2, STEAM_ID, 'b'.repeat(32))
  })
})

describe('steam:getOwnedGames when the live fetch fails', () => {
  const SAVED = [{ appId: '10', title: 'Counter-Strike', coverUrl: null }]

  function expectNothingDeleted(): void {
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCovers).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
    expect(clearSteamConnection).not.toHaveBeenCalled()
    expect(clearSecret).not.toHaveBeenCalled()
  }

  it.each([
    ['offline', new SteamApiError('offline', 'Could not reach Steam (TypeError)')],
    ['keyRejected', new SteamApiError('keyRejected', 'Steam API responded with 403')],
    ['unavailable', new SteamApiError('unavailable', 'Steam API responded with 503')]
  ] as const)('falls back to the saved library and reports %s', async (problem, error) => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(error)
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(SAVED)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual({
      source: 'cache',
      games: SAVED,
      problem
    })
    expect(getCachedSteamLibrary).toHaveBeenCalledWith(STEAM_ID)
    expectNothingDeleted()
  })

  it('reports an error it does not recognize as unavailable, not as a rejected key', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new SyntaxError('Unexpected token <'))
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(SAVED)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toMatchObject({ problem: 'unavailable' })
  })

  it('returns local cover URLs for the saved copy too', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new SteamApiError('offline', 'x'))
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(SAVED)
    const local = [{ appId: '10', title: 'Counter-Strike', coverUrl: 'app-cover://covers/10' }]
    vi.mocked(withLocalCoverUrls).mockResolvedValue(local)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toMatchObject({ games: local })
  })

  it('still falls back when the saved library is empty', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new SteamApiError('offline', 'x'))
    vi.mocked(getCachedSteamLibrary).mockResolvedValue([])

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual({
      source: 'cache',
      games: [],
      problem: 'offline'
    })
  })

  it.each([
    ['offline', new SteamApiError('offline', 'x')],
    ['keyRejected', new SteamApiError('keyRejected', 'x')],
    ['unavailable', new SteamApiError('unavailable', 'x')]
  ] as const)(
    'with nothing saved, reports %s as data instead of throwing',
    async (problem, error) => {
      connectedWithKey()
      vi.mocked(getOwnedSteamGames).mockRejectedValue(error)
      vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)

      expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual({
        source: 'none',
        games: null,
        problem
      })
      expectNothingDeleted()
    }
  )

  it('never leaks the raw error text to the renderer', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(
      new SteamApiError('unavailable', 'Steam API responded with 503 key=SECRET')
    )
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)

    const result = await invoke(STEAM_CHANNELS.getOwnedGames)

    expect(JSON.stringify(result)).not.toMatch(/SECRET|503/)
  })
})

describe('steam:getCachedLibrary', () => {
  it('returns null when disconnected, without reading the cache', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })

    expect(await invoke(STEAM_CHANNELS.getCachedLibrary)).toBeNull()
    expect(getCachedSteamLibrary).not.toHaveBeenCalled()
  })

  it('returns null when nothing is cached for the account', async () => {
    connectedWithKey()
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)

    expect(await invoke(STEAM_CHANNELS.getCachedLibrary)).toBeNull()
  })

  it('tags the cached games with the account main looked them up for', async () => {
    connectedWithKey()
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(GAMES)

    expect(await invoke(STEAM_CHANNELS.getCachedLibrary)).toEqual({
      steamId64: STEAM_ID,
      games: GAMES
    })
    expect(getCachedSteamLibrary).toHaveBeenCalledWith(STEAM_ID)
  })

  it('returns local cover URLs for covers already on disk', async () => {
    connectedWithKey()
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(GAMES)
    const local = [{ appId: '10', title: 'Counter-Strike', coverUrl: 'app-cover://covers/10' }]
    vi.mocked(withLocalCoverUrls).mockResolvedValue(local)

    expect(await invoke(STEAM_CHANNELS.getCachedLibrary)).toEqual({
      steamId64: STEAM_ID,
      games: local
    })
  })
})

describe('steam:disconnect', () => {
  it('clears the saved library along with the connection', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue(null)

    await invoke(STEAM_CHANNELS.disconnect)

    expect(clearSteamConnection).toHaveBeenCalledOnce()
    expect(clearCachedSteamLibrary).toHaveBeenCalledOnce()
  })

  it('clears the cached cover images too', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue(null)

    await invoke(STEAM_CHANNELS.disconnect)

    expect(clearCovers).toHaveBeenCalledOnce()
  })

  it('reports a failure to remove the covers instead of pretending they are gone', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue(null)
    vi.mocked(clearCovers).mockRejectedValue(new Error('Could not remove all saved cover images.'))

    await expect(invoke(STEAM_CHANNELS.disconnect)).rejects.toThrow(
      'Could not remove all saved cover images.'
    )
  })

  it('does not delete the saved API key', async () => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue('a'.repeat(32))

    await invoke(STEAM_CHANNELS.disconnect)

    expect(clearSecret).not.toHaveBeenCalled()
  })
})
