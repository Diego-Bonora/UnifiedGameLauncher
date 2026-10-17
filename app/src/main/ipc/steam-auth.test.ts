import { beforeEach, describe, expect, it, vi } from 'vitest'

// Handlers are captured as registerSteamAuthIpc() runs, then invoked directly
// by channel name — no real Electron process involved.
const { handlers, windows } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
  windows: [] as Array<{ isDestroyed: () => boolean; webContents: { send: (c: string) => void } }>
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    }
  }
}))

// Read by the sender check; the tests act as the packaged app's page.
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

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
import { openSteamSignInInBrowser } from '../stores/steam/openid'
import {
  clearSteamConnection,
  getSteamConnection,
  setSteamConnection
} from '../storage/connection-store'
import { clearSecret, getSecret, setSecret } from '../storage/secret-store'
import { clearCovers, syncCovers, withLocalCoverUrls } from '../library/cover-cache'
import {
  clearCachedSteamLibrary,
  getCachedSteamLibrary,
  setCachedSteamLibrary
} from '../library/library-cache'

const STEAM_ID = '76561197960287930'
const GAMES = [{ appId: '10', title: 'Counter-Strike', coverUrl: null }]

const live = (games: unknown): unknown => ({ source: 'live', games, problem: null })

// What a call from the app's own page looks like: its top-level frame, on
// the bundled file.
const appFrame = {
  url: 'file:///C:/Program%20Files/App/resources/app.asar/out/renderer/index.html'
}
const APP_EVENT = { senderFrame: appFrame, sender: { mainFrame: appFrame } }

async function invoke(
  channel: string,
  payload?: unknown,
  event: unknown = APP_EVENT
): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`no handler registered for ${channel}`)
  return handler(event, payload)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.mocked(withLocalCoverUrls).mockImplementation(async (games) => games)
  vi.mocked(syncCovers).mockResolvedValue(0)
  vi.mocked(clearCovers).mockResolvedValue(undefined)
  handlers.clear()
  windows.length = 0
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
    vi.mocked(syncCovers).mockReturnValue(new Promise<number>(() => undefined))

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

describe('steam:getOwnedGames telling the window about new covers', () => {
  function openWindow(destroyed = false): ReturnType<typeof vi.fn> {
    const send = vi.fn()
    windows.push({ isDestroyed: () => destroyed, webContents: { send } })
    return send
  }

  function liveSetup(): void {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)
    vi.mocked(setCachedSteamLibrary).mockResolvedValue(undefined)
  }

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

  it('notifies every open window once covers have been downloaded', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockResolvedValue(3)
    const first = openWindow()
    const second = openWindow()

    await invoke(STEAM_CHANNELS.getOwnedGames)
    await flush()

    expect(first).toHaveBeenCalledWith(STEAM_CHANNELS.coversChanged)
    expect(second).toHaveBeenCalledWith(STEAM_CHANNELS.coversChanged)
  })

  it('stays quiet when nothing new was downloaded', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockResolvedValue(0)
    const send = openWindow()

    await invoke(STEAM_CHANNELS.getOwnedGames)
    await flush()

    expect(send).not.toHaveBeenCalled()
  })

  it('skips a window that has been destroyed', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockResolvedValue(1)
    const gone = openWindow(true)
    const alive = openWindow()

    await invoke(STEAM_CHANNELS.getOwnedGames)
    await flush()

    expect(gone).not.toHaveBeenCalled()
    expect(alive).toHaveBeenCalledOnce()
  })

  it('does not let one failing window stop the others or reject', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockResolvedValue(2)
    // A window mid-teardown: not "destroyed" yet, but send() throws.
    windows.push({
      isDestroyed: () => false,
      webContents: {
        send: () => {
          throw new Error('Object has been destroyed')
        }
      }
    })
    const healthy = openWindow()

    await expect(invoke(STEAM_CHANNELS.getOwnedGames)).resolves.toEqual(live(GAMES))
    await flush()

    expect(healthy).toHaveBeenCalledWith(STEAM_CHANNELS.coversChanged)
  })

  it('copes with no open windows (closed while covers were downloading)', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockResolvedValue(4)

    await expect(invoke(STEAM_CHANNELS.getOwnedGames)).resolves.toEqual(live(GAMES))
    await flush()
  })

  it('does not notify when the live refresh failed and no sync ran', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockRejectedValue(new SteamApiError('offline', 'x'))
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(null)
    const send = openWindow()

    await invoke(STEAM_CHANNELS.getOwnedGames)
    await flush()

    expect(send).not.toHaveBeenCalled()
  })

  it('does not hold up the library while covers download', async () => {
    liveSetup()
    vi.mocked(syncCovers).mockReturnValue(new Promise<number>(() => undefined))
    openWindow()

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
  const disconnected = { status: 'disconnected', steamId64: null, hasApiKey: false }

  beforeEach(() => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
    vi.mocked(getSecret).mockResolvedValue(null)
  })

  it('deletes the saved library and covers first, then the connection', async () => {
    const order: string[] = []
    vi.mocked(clearCachedSteamLibrary).mockImplementation(async () => void order.push('library'))
    vi.mocked(clearCovers).mockImplementation(async () => void order.push('covers'))
    vi.mocked(clearSteamConnection).mockImplementation(async () => void order.push('connection'))

    expect(await invoke(STEAM_CHANNELS.disconnect)).toEqual({
      connection: disconnected,
      problem: null
    })
    expect(order).toEqual(['library', 'covers', 'connection'])
  })

  it('stays connected and says so when the covers could not all be removed', async () => {
    vi.mocked(clearCovers).mockRejectedValue(new Error('Could not remove all saved cover images.'))
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'connected', steamId64: STEAM_ID })

    expect(await invoke(STEAM_CHANNELS.disconnect)).toEqual({
      connection: { status: 'connected', steamId64: STEAM_ID, hasApiKey: false },
      problem: 'removeFailed'
    })
    expect(clearSteamConnection).not.toHaveBeenCalled()
  })

  it('stays connected when the saved library could not be removed', async () => {
    vi.mocked(clearCachedSteamLibrary).mockRejectedValue(new Error('EPERM'))

    expect(await invoke(STEAM_CHANNELS.disconnect)).toMatchObject({ problem: 'removeFailed' })
    expect(clearSteamConnection).not.toHaveBeenCalled()
  })

  it('does not delete the saved API key', async () => {
    vi.mocked(getSecret).mockResolvedValue('a'.repeat(32))

    await invoke(STEAM_CHANNELS.disconnect)

    expect(clearSecret).not.toHaveBeenCalled()
  })

  it('a library read already running saves nothing and starts no covers once Steam answers', async () => {
    connectedWithKey()
    let answer: (games: typeof GAMES) => void = () => undefined
    vi.mocked(getOwnedSteamGames).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const reading = invoke(STEAM_CHANNELS.getOwnedGames)
    await new Promise((resolve) => setTimeout(resolve, 0))

    await invoke(STEAM_CHANNELS.disconnect)
    answer(GAMES)
    await reading

    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
  })

  it('a read still checking the connection when Disconnect lands saves nothing', async () => {
    connectedWithKey()
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    // The key read (safeStorage, a file) is still running when Disconnect
    // starts, so the read sees "connected": the connection goes last.
    let keyRead: (key: string) => void = () => undefined
    vi.mocked(getSecret).mockReturnValueOnce(new Promise((resolve) => (keyRead = resolve)))
    const reading = invoke(STEAM_CHANNELS.getOwnedGames)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const disconnecting = invoke(STEAM_CHANNELS.disconnect)
    keyRead('a'.repeat(32))
    await Promise.all([reading, disconnecting])

    expect(getOwnedSteamGames).not.toHaveBeenCalled()
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
  })

  it('a read waiting on one disconnect also waits out a second that starts meanwhile', async () => {
    // Connected until a disconnect really clears the connection.
    let connected = true
    vi.mocked(getSteamConnection).mockImplementation(async () =>
      connected
        ? { status: 'connected', steamId64: STEAM_ID }
        : { status: 'disconnected', steamId64: null }
    )
    vi.mocked(getSecret).mockResolvedValue('a'.repeat(32))
    vi.mocked(getOwnedSteamGames).mockResolvedValue(GAMES)
    // The first disconnect fails (stays connected); the second is held.
    let finishFirst: () => void = () => undefined
    let finishSecond: () => void = () => undefined
    vi.mocked(clearCachedSteamLibrary)
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => (finishFirst = () => reject(new Error('EPERM'))))
      )
      .mockReturnValueOnce(new Promise<void>((resolve) => (finishSecond = resolve)))
    vi.mocked(clearSteamConnection).mockImplementation(async () => {
      connected = false
    })
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

    const first = invoke(STEAM_CHANNELS.disconnect)
    const reading = invoke(STEAM_CHANNELS.getOwnedGames).catch(() => undefined)
    await tick()
    const second = invoke(STEAM_CHANNELS.disconnect)
    finishFirst()
    await first
    await tick()
    // Still waiting on the second disconnect: nothing read or saved yet.
    expect(getOwnedSteamGames).not.toHaveBeenCalled()

    finishSecond()
    await Promise.all([second, reading])
    expect(setCachedSteamLibrary).not.toHaveBeenCalled()
    expect(syncCovers).not.toHaveBeenCalled()
  })

  it('a library read during the disconnect waits for it and sees the result', async () => {
    // Connected until the disconnect really clears the connection.
    let connected = true
    vi.mocked(getSteamConnection).mockImplementation(async () =>
      connected
        ? { status: 'connected', steamId64: STEAM_ID }
        : { status: 'disconnected', steamId64: null }
    )
    vi.mocked(clearSteamConnection).mockImplementation(async () => {
      connected = false
    })
    vi.mocked(getCachedSteamLibrary).mockResolvedValue(GAMES)
    let finish: () => void = () => undefined
    vi.mocked(clearCachedSteamLibrary).mockReturnValue(
      new Promise<void>((resolve) => (finish = resolve))
    )
    const disconnecting = invoke(STEAM_CHANNELS.disconnect)
    const reading = invoke(STEAM_CHANNELS.getCachedLibrary)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getCachedSteamLibrary).not.toHaveBeenCalled()

    finish()
    await disconnecting
    // Disconnected by then: nothing is read or returned.
    expect(await reading).toBeNull()
    expect(getCachedSteamLibrary).not.toHaveBeenCalled()
  })
})

describe('steam:signIn', () => {
  const connected = { status: 'connected', steamId64: STEAM_ID, hasApiKey: false }
  const disconnected = { status: 'disconnected', steamId64: null, hasApiKey: false }

  beforeEach(() => {
    vi.mocked(getSecret).mockResolvedValue(null)
  })

  it('saves the Steam ID and returns the new connection', async () => {
    vi.mocked(openSteamSignInInBrowser).mockResolvedValue({ steamId64: STEAM_ID })
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'connected', steamId64: STEAM_ID })

    expect(await invoke(STEAM_CHANNELS.signIn)).toEqual({ connection: connected, problem: null })
    expect(setSteamConnection).toHaveBeenCalledWith({ status: 'connected', steamId64: STEAM_ID })
  })

  it('returns a failed verification as data, keeping what was saved', async () => {
    vi.mocked(openSteamSignInInBrowser).mockResolvedValue({ failed: true })
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })

    expect(await invoke(STEAM_CHANNELS.signIn)).toEqual({
      connection: disconnected,
      problem: 'verifyFailed'
    })
    expect(setSteamConnection).not.toHaveBeenCalled()
  })

  it('returns a connection that could not be saved as data', async () => {
    vi.mocked(openSteamSignInInBrowser).mockResolvedValue({ steamId64: STEAM_ID })
    vi.mocked(setSteamConnection).mockRejectedValue(new Error('EPERM'))
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })

    expect(await invoke(STEAM_CHANNELS.signIn)).toEqual({
      connection: disconnected,
      problem: 'cannotSave'
    })
  })

  it('a cancelled sign-in is no problem and changes nothing', async () => {
    vi.mocked(openSteamSignInInBrowser).mockResolvedValue({ cancelled: true })
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })

    expect(await invoke(STEAM_CHANNELS.signIn)).toEqual({ connection: disconnected, problem: null })
    expect(setSteamConnection).not.toHaveBeenCalled()
  })
})

describe('steam:setApiKey', () => {
  beforeEach(() => {
    vi.mocked(getSteamConnection).mockResolvedValue({ status: 'disconnected', steamId64: null })
  })

  it('saves a well-formed key (trimmed) and returns the connection', async () => {
    vi.mocked(getSecret).mockResolvedValue('a'.repeat(32))

    expect(await invoke(STEAM_CHANNELS.setApiKey, { apiKey: ` ${'a'.repeat(32)} ` })).toEqual({
      saved: true,
      connection: { status: 'disconnected', steamId64: null, hasApiKey: true }
    })
    expect(setSecret).toHaveBeenCalledWith('steamApiKey', 'a'.repeat(32))
  })

  it('returns a malformed key as data and saves nothing', async () => {
    expect(await invoke(STEAM_CHANNELS.setApiKey, { apiKey: 'not a key' })).toEqual({
      saved: false,
      reason: 'invalidKey'
    })
    expect(setSecret).not.toHaveBeenCalled()
  })

  it('returns a key that could not be stored as data', async () => {
    vi.mocked(setSecret).mockRejectedValue(new Error('This computer cannot securely store secrets'))

    expect(await invoke(STEAM_CHANNELS.setApiKey, { apiKey: 'a'.repeat(32) })).toEqual({
      saved: false,
      reason: 'cannotStore'
    })
  })
})

describe('callers other than the app page', () => {
  it('are refused, and nothing is deleted', async () => {
    const page = { url: 'https://evil.test/' }
    const foreign = { senderFrame: page, sender: { mainFrame: page } }

    await expect(invoke(STEAM_CHANNELS.disconnect, undefined, foreign)).rejects.toThrow('Refused')
    expect(clearCachedSteamLibrary).not.toHaveBeenCalled()
    expect(clearCovers).not.toHaveBeenCalled()
    expect(clearSteamConnection).not.toHaveBeenCalled()
  })
})
