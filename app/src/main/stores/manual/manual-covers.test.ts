import { describe, expect, it, vi } from 'vitest'
import { createManualCovers, type ManualCoverDeps } from './manual-covers'
import { createManualGamesFile, type SavedManualGame } from './manual-games-file'
import type { SteamTitleSearch } from './steam-title-search'

const A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const GONE = '16fd2706-8baf-433b-82eb-8c7fada847da'

// Smallest byte strings detectImageExtension accepts.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
// Another valid PNG, to tell two exes' icons apart.
const PNG_B = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 1, 1])
const HTML = new TextEncoder().encode('<html>error</html>')

const game = (
  id: string,
  title: string,
  extra: Partial<SavedManualGame> = {}
): SavedManualGame => ({
  id,
  title,
  exePath: `C:\\Games\\${title}\\game.exe`,
  args: '',
  coverSource: 'steam',
  ...extra
})

interface Setup {
  covers: ReturnType<typeof createManualCovers>
  deps: ManualCoverDeps
  files: Map<string, Uint8Array>
  saved: () => SavedManualGame[]
  setGames: (games: SavedManualGame[]) => void
  search: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
}

function setup(
  games: SavedManualGame[],
  answer: (title: string) => SteamTitleSearch = () => ({ kind: 'found', appId: '367520' }),
  overrides: Partial<ManualCoverDeps> = {}
): Setup {
  let content = JSON.stringify({ games })
  const file = createManualGamesFile({
    readFile: async () => content,
    writeFile: async (data) => {
      content = data
    }
  })
  const files = new Map<string, Uint8Array>()
  let clock = 1000
  const mtimes = new Map<string, number>()
  const search = vi.fn(async (title: string) => answer(title))
  const notify = vi.fn()
  const deps: ManualCoverDeps = {
    file,
    search,
    posterUrlFor: async (appId) =>
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`,
    downloadPoster: async () => JPG,
    exeExists: async () => true,
    readIcon: async () => PNG,
    listFiles: async () =>
      [...files.keys()].map((name) => ({ name, mtimeMs: mtimes.get(name) ?? 0 })),
    writeFile: async (name, bytes) => {
      files.set(name, bytes)
      mtimes.set(name, (clock += 1))
    },
    deleteFile: async (name) => {
      files.delete(name)
    },
    notify,
    ...overrides
  }
  return {
    covers: createManualCovers(deps),
    deps,
    files,
    saved: () => JSON.parse(content).games,
    setGames: (next) => {
      content = JSON.stringify({ games: next })
    },
    search,
    notify
  }
}

async function sync(s: Setup): Promise<void> {
  s.covers.requestSync()
  await s.covers.whenIdle()
}

describe('manual covers: Steam poster', () => {
  it('finds the poster by title, saves it and the icon, and remembers the app id', async () => {
    const s = setup([game(A, 'Hollow Knight')])
    await sync(s)
    expect([...s.files.keys()].sort()).toEqual([`${A}-icon.png`, `${A}-poster.jpg`])
    expect(s.saved()[0]).toMatchObject({
      steamAppId: '367520',
      iconFor: 'C:\\Games\\Hollow Knight\\game.exe'
    })
    expect(s.notify).toHaveBeenCalled()
    const urls = await s.covers.urls(s.saved())
    expect(urls.get(A)?.posterUrl).toMatch(new RegExp(`^app-cover://manual/${A}-poster\\?v=\\d+$`))
    expect(urls.get(A)?.iconUrl).toMatch(new RegExp(`^app-cover://manual/${A}-icon\\?v=\\d+$`))
  })

  it('never asks Steam about an Exe icon game (its title is not sent anywhere)', async () => {
    const s = setup([game(A, 'Secret Project', { coverSource: 'icon' })])
    await sync(s)
    expect(s.search).not.toHaveBeenCalled()
    expect([...s.files.keys()]).toEqual([`${A}-icon.png`])
  })

  it('remembers a miss per title and does not ask again, even after a restart', async () => {
    const s = setup([game(A, 'My Homebrew')], () => ({ kind: 'miss' }))
    await sync(s)
    expect(s.saved()[0]?.coverMissTitle).toBe('My Homebrew')
    // A new app session (a fresh covers object) still doesn't ask.
    const again = createManualCovers({ ...s.deps })
    again.requestSync()
    await again.whenIdle()
    expect(s.search).toHaveBeenCalledTimes(1)
  })

  it('asks again for a new title after a miss', async () => {
    const s = setup([game(A, 'Doom', { coverMissTitle: 'Doom 93' })])
    await sync(s)
    expect(s.search).toHaveBeenCalledWith('Doom')
  })

  it('retries a failed lookup on the next start, but not on every list read', async () => {
    const s = setup([game(A, 'Doom')], () => ({ kind: 'failed' }))
    await sync(s)
    await sync(s)
    expect(s.search).toHaveBeenCalledTimes(1)
    expect(s.saved()[0]?.coverMissTitle).toBeUndefined()
    const nextStart = createManualCovers({ ...s.deps })
    nextStart.requestSync()
    await nextStart.whenIdle()
    expect(s.search).toHaveBeenCalledTimes(2)
  })

  it('treats a Steam game without a poster as a miss', async () => {
    const s = setup([game(A, 'Doom')], undefined, { posterUrlFor: async () => null })
    await sync(s)
    expect(s.saved()[0]?.coverMissTitle).toBe('Doom')
    expect(s.files.has(`${A}-poster.jpg`)).toBe(false)
  })

  it('never saves a download that is not an image', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = setup([game(A, 'Doom')], undefined, { downloadPoster: async () => HTML })
    await sync(s)
    expect([...s.files.keys()]).toEqual([`${A}-icon.png`])
    expect(s.saved()[0]?.steamAppId).toBeUndefined()
    warn.mockRestore()
  })

  it('throws away a poster found for a title the user changed meanwhile', async () => {
    let s: Setup | null = null
    s = setup([game(A, 'Doom')], undefined, {
      downloadPoster: async () => {
        // The user renames the game while the poster downloads.
        s?.setGames([game(A, 'Doom Classic')])
        return JPG
      }
    })
    await sync(s)
    expect(s.files.has(`${A}-poster.jpg`)).toBe(false)
    expect(s.saved()[0]?.steamAppId).toBeUndefined()
  })
})

describe('manual covers: icons and housekeeping', () => {
  it('reads the icon again after Change .exe', async () => {
    const readIcon = vi.fn(async () => PNG)
    const s = setup([game(A, 'Doom', { coverSource: 'icon' })], undefined, { readIcon })
    await sync(s)
    s.setGames([{ ...s.saved()[0]!, exePath: 'D:\\Doom\\doom.exe' }])
    await sync(s)
    expect(readIcon).toHaveBeenLastCalledWith('D:\\Doom\\doom.exe')
    expect(s.saved()[0]?.iconFor).toBe('D:\\Doom\\doom.exe')
    // And not again when nothing changed.
    await sync(s)
    expect(readIcon).toHaveBeenCalledTimes(2)
  })

  it('deletes files of games that are gone, and leaves other games alone', async () => {
    const s = setup([game(A, 'Doom', { coverSource: 'icon' })])
    s.files.set(`${GONE}-poster.jpg`, JPG)
    s.files.set(`${GONE}-icon.png`, PNG)
    s.files.set('notes.txt', PNG)
    await sync(s)
    expect([...s.files.keys()].sort()).toEqual([`${A}-icon.png`, 'notes.txt'])
  })

  it('does nothing at all while the saved list cannot be read', async () => {
    const s = setup([])
    s.files.set(`${GONE}-icon.png`, PNG)
    const covers = createManualCovers({
      ...s.deps,
      file: { ...s.deps.file, read: async () => ({ readable: false }) }
    })
    covers.requestSync()
    await covers.whenIdle()
    expect(s.files.has(`${GONE}-icon.png`)).toBe(true)
  })

  it('forget deletes both files; dropPoster only the poster', async () => {
    const s = setup([game(A, 'Doom'), game(B, 'Quake')])
    await sync(s)
    await s.covers.dropPoster(A)
    expect(s.files.has(`${A}-poster.jpg`)).toBe(false)
    expect(s.files.has(`${A}-icon.png`)).toBe(true)
    await s.covers.forget(B)
    expect([...s.files.keys()]).toEqual([`${A}-icon.png`])
  })

  it('runs one sync at a time, and one more if asked meanwhile', async () => {
    const s = setup([game(A, 'Doom')])
    s.covers.requestSync()
    s.covers.requestSync()
    s.covers.requestSync()
    await s.covers.whenIdle()
    expect(s.search).toHaveBeenCalledTimes(1)
  })
})

describe('manual covers: review fixes', () => {
  it('never loops: a locked list file or an undeletable file does not rewrite or notify again', async () => {
    const s = setup([game(A, 'Doom', { coverSource: 'icon' })])
    s.files.set(`${GONE}-icon.png`, PNG)
    const covers = createManualCovers({
      ...s.deps,
      file: {
        ...s.deps.file,
        update: async () => ({ saved: false, reason: 'cannotSave', games: null })
      },
      deleteFile: async () => Promise.reject(new Error('EPERM'))
    })
    covers.requestSync()
    await covers.whenIdle()
    const writes = s.files.size
    s.notify.mockClear()
    covers.requestSync()
    await covers.whenIdle()
    expect(s.files.size).toBe(writes)
    expect(s.notify).not.toHaveBeenCalled()
  })

  it('asks again after a switch back to Steam cover (retry), even after a failure this session', async () => {
    let answer: SteamTitleSearch = { kind: 'failed' }
    const s = setup([game(A, 'Doom')], () => answer)
    await sync(s)
    answer = { kind: 'found', appId: '2280' }
    await sync(s)
    expect(s.search).toHaveBeenCalledTimes(1)
    s.covers.retry(A)
    await sync(s)
    expect(s.search).toHaveBeenCalledTimes(2)
    expect(s.files.has(`${A}-poster.jpg`)).toBe(true)
  })

  it('does not send a title the user switched to Exe icon while the sync was busy', async () => {
    let s: Setup | null = null
    s = setup([game(A, 'Doom'), game(B, 'Private Build')], (title) => {
      // While Doom is being looked up, the user switches B to Exe icon.
      if (title === 'Doom')
        s?.setGames([game(A, 'Doom'), game(B, 'Private Build', { coverSource: 'icon' })])
      return { kind: 'miss' }
    })
    await sync(s)
    expect(s.search.mock.calls.map((call) => call[0])).toEqual(['Doom'])
  })

  it('does not save a generic icon for an exe that is missing right now', async () => {
    const readIcon = vi.fn(async () => PNG)
    const s = setup([game(A, 'Doom', { coverSource: 'icon' })], undefined, {
      exeExists: async () => false,
      readIcon
    })
    await sync(s)
    expect(readIcon).not.toHaveBeenCalled()
    expect(s.files.size).toBe(0)
  })

  it('cleans up nothing when the list is empty (a missing file reads as no games)', async () => {
    const s = setup([])
    s.files.set(`${GONE}-poster.jpg`, JPG)
    await sync(s)
    expect(s.files.has(`${GONE}-poster.jpg`)).toBe(true)
  })

  it('never shows or keeps a poster without the app id it was found for (renamed)', async () => {
    const s = setup([game(A, 'Doom Mod', { coverMissTitle: 'Doom Mod' })])
    s.files.set(`${A}-poster.jpg`, JPG)
    expect((await s.covers.urls(s.saved())).get(A)?.posterUrl).toBeNull()
    await sync(s)
    expect(s.files.has(`${A}-poster.jpg`)).toBe(false)
  })

  it('keeps a poster saved this session even if its app id could not be saved', async () => {
    const s = setup([game(A, 'Doom')])
    const covers = createManualCovers({
      ...s.deps,
      file: {
        ...s.deps.file,
        update: async () => ({ saved: false, reason: 'cannotSave', games: null })
      }
    })
    covers.requestSync()
    await covers.whenIdle()
    covers.requestSync()
    await covers.whenIdle()
    expect(s.files.has(`${A}-poster.jpg`)).toBe(true)
    expect((await covers.urls(s.saved())).get(A)?.posterUrl).not.toBeNull()
  })

  it('pauses between searches', async () => {
    const pause = vi.fn(async () => undefined)
    const s = setup([game(A, 'Doom'), game(B, 'Quake')], undefined, { pauseBetweenSearches: pause })
    await sync(s)
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('reads the first exe’s icon again after Change .exe to B and back to A', async () => {
    const readIcon = vi.fn(async (path: string) => (path.includes('B') ? PNG_B : PNG))
    const s = setup(
      [game(A, 'Doom', { coverSource: 'icon', exePath: 'C:\\A\\a.exe' })],
      undefined,
      {
        readIcon
      }
    )
    await sync(s)
    s.setGames([{ ...s.saved()[0]!, exePath: 'C:\\B\\b.exe' }])
    s.covers.retry(A)
    await sync(s)
    s.setGames([{ ...s.saved()[0]!, exePath: 'C:\\A\\a.exe' }])
    s.covers.retry(A)
    await sync(s)
    expect(readIcon.mock.calls.map((call) => call[0])).toEqual([
      'C:\\A\\a.exe',
      'C:\\B\\b.exe',
      'C:\\A\\a.exe'
    ])
    expect(s.saved()[0]?.iconFor).toBe('C:\\A\\a.exe')
  })
})
