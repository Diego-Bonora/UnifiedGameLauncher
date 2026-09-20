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
vi.mock('../stores/steam/owned-games', () => ({ getOwnedSteamGames: vi.fn() }))
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
import { getOwnedSteamGames } from '../stores/steam/owned-games'
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

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(GAMES)
    expect(setCachedSteamLibrary).toHaveBeenCalledWith(STEAM_ID, GAMES)
  })

  it('starts cover downloads and returns local cover URLs where they exist', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    const local = [{ appId: '10', title: 'Counter-Strike', coverUrl: 'app-cover://covers/10' }]
    vi.mocked(withLocalCoverUrls).mockResolvedValue(local)

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(local)
    expect(syncCovers).toHaveBeenCalledWith(GAMES)
  })

  it('does not wait for cover downloads before returning the library', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
    // Never settles: if the handler awaited it, this test would time out.
    vi.mocked(syncCovers).mockReturnValue(new Promise(() => undefined))

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(GAMES)
  })

  it('still returns the live result when saving the cache fails', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(setCachedSteamLibrary).mockRejectedValue(new Error('disk full'))

    expect(await invoke(STEAM_CHANNELS.getOwnedGames)).toEqual(GAMES)
  })

  it('does not touch the cache, covers, connection or API key when the fetch fails', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new Error('network down'))

    await expect(invoke(STEAM_CHANNELS.getOwnedGames)).rejects.toThrow(
      'Could not load your Steam library. Please try again later.'
    )
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCovers).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
    expect(clearSteamConnection).not.toHaveBeenCalled()
    expect(clearSecret).not.toHaveBeenCalled()
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
