import { describe, expect, it, vi } from 'vitest'
import { createManualGamesFile, type SavedManualGame } from '../stores/manual'
import type { ManualGamesFileDeps } from '../stores/manual/manual-games-file'
import type { DirectStoreProvider } from '../stores/store-provider'
import {
  createManualHandlers,
  type ManualHandlerDeps,
  type ManualHandlers
} from './manual-handlers'

const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const DOOM = 'C:\\Games\\Doom\\doom.exe'
const QUAKE = 'C:\\Games\\Quake\\quake.exe'

function memoryFile(
  initial?: SavedManualGame[]
): ManualGamesFileDeps & { saved: () => SavedManualGame[] | undefined; unreadable: boolean } {
  let content = initial === undefined ? undefined : JSON.stringify({ games: initial })
  const deps = {
    unreadable: false,
    saved: () =>
      content === undefined ? undefined : (JSON.parse(content).games as SavedManualGame[]),
    readFile: async (): Promise<string> => {
      if (deps.unreadable) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return content
    },
    writeFile: async (data: string): Promise<void> => {
      content = data
    }
  }
  return deps
}

const saved = (id: string, title: string, exePath: string, args = ''): SavedManualGame => ({
  id,
  title,
  exePath,
  args,
  coverSource: 'steam'
})

type Owner = 'window'

interface Setup {
  handlers: ManualHandlers<Owner>
  deps: ManualHandlerDeps<Owner>
  fileDeps: ReturnType<typeof memoryFile>
  picks: (string | null)[]
  provider: DirectStoreProvider
}

function setup(
  initial?: SavedManualGame[],
  overrides: Partial<ManualHandlerDeps<Owner>> = {}
): Setup {
  const fileDeps = memoryFile(initial)
  const file = createManualGamesFile(fileDeps)
  const picks: (string | null)[] = []
  const provider: DirectStoreProvider = {
    store: 'manual',
    launchesBy: 'direct',
    getInstalledGames: async () => [],
    launch: vi.fn(async () => ({ accepted: true as const }))
  }
  const deps: ManualHandlerDeps<Owner> = {
    file,
    provider,
    pickExe: vi.fn(async () => picks.shift() ?? null),
    confirmArgs: vi.fn(async () => true),
    isExeFile: async (path) => /\.exe$/i.test(path),
    // Real paths are the picked ones, except a link that leads elsewhere.
    resolveExePath: async (path) => (path === 'C:\\Games\\link.exe' ? 'C:\\Games\\run.bat' : path),
    suggestedTitle: (path) =>
      path
        .split('\\')
        .pop()
        ?.replace(/\.exe$/i, '') ?? path,
    removeFavorite: vi.fn(async () => undefined),
    newId: () => ID_B,
    covers: {
      urls: async () => new Map(),
      requestSync: vi.fn(),
      retry: vi.fn(),
      forget: vi.fn(async () => undefined),
      dropPoster: vi.fn(async () => undefined),
      whenIdle: async () => undefined
    },
    ...overrides
  }
  return { handlers: createManualHandlers(deps), deps, fileDeps, picks, provider }
}

describe('manual handlers: list', () => {
  it('never sends exe paths to the renderer', async () => {
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM, '-fast')])
    const list = await handlers.list()
    expect(list).toEqual({
      readable: true,
      games: [
        {
          id: ID_A,
          title: 'Doom',
          args: '-fast',
          coverSource: 'steam',
          posterUrl: null,
          iconUrl: null
        }
      ]
    })
    expect(JSON.stringify(list)).not.toContain('doom.exe')
  })

  it('says when the saved list cannot be read', async () => {
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)])
    fileDeps.unreadable = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await handlers.list()).toEqual({ readable: false, games: [] })
    warn.mockRestore()
  })
})

describe('manual handlers: adding', () => {
  it('adds the picked exe with the title from the form', async () => {
    const { handlers, picks, fileDeps } = setup()
    picks.push(QUAKE)
    expect(await handlers.pickExe('window')).toEqual({ picked: true, suggestedTitle: 'quake' })
    const result = await handlers.add('window', { title: '  Quake  ', args: '' })
    expect(result.saved).toBe(true)
    expect(fileDeps.saved()).toEqual([saved(ID_B, 'Quake', QUAKE)])
  })

  it('takes the path only from its own dialog, never from the request', async () => {
    const { handlers, picks, fileDeps } = setup()
    picks.push(QUAKE)
    await handlers.pickExe('window')
    await handlers.add('window', { title: 'Quake', args: '', exePath: 'C:\\Windows\\evil.exe' })
    expect(fileDeps.saved()?.[0]?.exePath).toBe(QUAKE)
  })

  it('refuses to add without a pick, or twice from one pick', async () => {
    const { handlers, picks } = setup()
    expect(await handlers.add('window', { title: 'Quake', args: '' })).toMatchObject({
      saved: false,
      reason: 'noPick'
    })
    picks.push(QUAKE)
    await handlers.pickExe('window')
    expect((await handlers.add('window', { title: 'Quake', args: '' })).saved).toBe(true)
    expect(await handlers.add('window', { title: 'Quake', args: '' })).toMatchObject({
      saved: false,
      reason: 'noPick'
    })
  })

  it('forgets the pick when the form is cancelled', async () => {
    const { handlers, picks } = setup()
    picks.push(QUAKE)
    await handlers.pickExe('window')
    handlers.cancelAdd()
    expect(await handlers.add('window', { title: 'Quake', args: '' })).toMatchObject({
      reason: 'noPick'
    })
  })

  it('asks main’s own dialog before saving arguments, and saves nothing on Cancel', async () => {
    const confirmArgs = vi.fn(async () => false)
    const { handlers, picks, fileDeps } = setup(undefined, { confirmArgs })
    picks.push(QUAKE)
    await handlers.pickExe('window')
    const result = await handlers.add('window', { title: 'Quake', args: '+map e1m1' })
    expect(result).toMatchObject({ saved: false, reason: 'notConfirmed' })
    expect(confirmArgs).toHaveBeenCalledWith('window', QUAKE, '+map e1m1')
    expect(fileDeps.saved()).toBeUndefined()
    // The pick is kept: the form stays open for another try.
    confirmArgs.mockResolvedValueOnce(true)
    expect((await handlers.add('window', { title: 'Quake', args: '+map e1m1' })).saved).toBe(true)
  })

  it('needs no confirmation for empty arguments', async () => {
    const { handlers, picks, deps } = setup()
    picks.push(QUAKE)
    await handlers.pickExe('window')
    await handlers.add('window', { title: 'Quake', args: '   ' })
    expect(deps.confirmArgs).not.toHaveBeenCalled()
  })

  it.each([
    ['the dialog was closed', null, 'cancelled'],
    ['it is not an .exe', 'C:\\Games\\Quake.lnk', 'notExe'],
    ['it is already a manual game (any spelling)', 'c:\\games\\doom\\DOOM.EXE', 'duplicate'],
    ['it is a link named .exe that leads to a script', 'C:\\Games\\link.exe', 'notExe']
  ])('does not pick a file when %s', async (_name, path, reason) => {
    const { handlers, picks } = setup([saved(ID_A, 'Doom', DOOM)])
    picks.push(path)
    expect(await handlers.pickExe('window')).toEqual({ picked: false, reason })
  })

  it('does not even open the dialog while the saved list cannot be read', async () => {
    const { handlers, fileDeps, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    fileDeps.unreadable = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await handlers.pickExe('window')).toEqual({ picked: false, reason: 'unreadable' })
    expect(deps.pickExe).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it.each([
    ['an empty title', { title: '   ', args: '' }],
    ['a title that is too long', { title: 'x'.repeat(201), args: '' }],
    ['a line break in the arguments', { title: 'Quake', args: '-a\n-b' }],
    ['arguments that are too long', { title: 'Quake', args: 'x'.repeat(1001) }],
    ['a missing field', { title: 'Quake' }]
  ])('throws for %s (a caller bug)', async (_name, request) => {
    const { handlers, picks } = setup()
    picks.push(QUAKE)
    await handlers.pickExe('window')
    await expect(handlers.add('window', request)).rejects.toThrow()
  })
})

describe('manual handlers: what the confirmation dialog shows is what is saved', () => {
  it.each([
    ['a right-to-left override', '-windowed\u202e--gpu-launcher=calc'],
    ['a zero-width space', '-windowed\u200b'],
    ['a line separator', '-windowed\u2028--gpu-launcher=calc'],
    ['a C1 control', '-windowed\u0085'],
    ['a byte-order mark inside', '-win\ufeffdowed']
  ])('refuses arguments with %s before any dialog opens', async (_name, args) => {
    const { handlers, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    await expect(handlers.setArgs('window', { id: ID_A, args })).rejects.toThrow()
    expect(deps.confirmArgs).not.toHaveBeenCalled()
  })

  it('refuses the same characters in titles', async () => {
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM)])
    await expect(handlers.rename({ id: ID_A, title: 'Doom\u202e' })).rejects.toThrow()
  })

  it.each([
    ['symbols and other scripts', 'Pokémon™ — ポケモン'],
    ['a Persian title with a zero-width non-joiner', 'می\u200cخواهم'],
    ['an emoji family (zero-width joiners)', '👨\u200d👩\u200d👧 Party']
  ])('accepts titles with %s', async (_name, title) => {
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)])
    expect((await handlers.rename({ id: ID_A, title })).saved).toBe(true)
    // And the saved file still reads back.
    expect(fileDeps.saved()?.[0]?.title).toBe(title)
    expect((await handlers.list()).readable).toBe(true)
  })

  it('keeps the strict rule for arguments, joiners included', async () => {
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM)])
    await expect(handlers.setArgs('window', { id: ID_A, args: '-a\u200d-b' })).rejects.toThrow()
  })
})

describe('manual handlers: one dialog at a time', () => {
  it('answers busy instead of opening a second dialog', async () => {
    let release: (path: string | null) => void = () => undefined
    const pickExe = vi.fn(() => new Promise<string | null>((resolve) => (release = resolve)))
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM)], { pickExe })
    const first = handlers.pickExe('window')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await handlers.pickExe('window')).toEqual({ picked: false, reason: 'busy' })
    expect(await handlers.changeExe('window', { id: ID_A })).toMatchObject({ reason: 'busy' })
    expect(await handlers.setArgs('window', { id: ID_A, args: '-x' })).toMatchObject({
      reason: 'busy'
    })
    expect(pickExe).toHaveBeenCalledTimes(1)
    release(QUAKE)
    expect(await first).toEqual({ picked: true, suggestedTitle: 'quake' })
    // And free again once it closed.
    expect((await handlers.setArgs('window', { id: ID_A, args: '-x' })).saved).toBe(true)
  })

  it('forgets an earlier pick when a new pick is not completed', async () => {
    const { handlers, picks } = setup()
    picks.push(QUAKE, null)
    await handlers.pickExe('window')
    expect(await handlers.pickExe('window')).toEqual({ picked: false, reason: 'cancelled' })
    expect(await handlers.add('window', { title: 'Quake', args: '' })).toMatchObject({
      reason: 'noPick'
    })
  })

  it('does not put back old arguments that another save changed meanwhile', async () => {
    let handlersRef: ManualHandlers<Owner> | null = null
    const confirmArgs = vi.fn(async () => {
      // Another save clears the arguments while this dialog is open.
      await handlersRef?.setArgs('window', { id: ID_A, args: '' })
      return true
    })
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM, '-fast')], { confirmArgs })
    handlersRef = handlers
    expect(await handlers.setArgs('window', { id: ID_A, args: '-slow' })).toMatchObject({
      saved: false,
      reason: 'busy'
    })
    expect(fileDeps.saved()?.[0]?.args).toBe('')
  })
})

describe('manual handlers: editing', () => {
  it('renames a game', async () => {
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)])
    expect((await handlers.rename({ id: ID_A, title: 'DOOM (1993)' })).saved).toBe(true)
    expect(fileDeps.saved()?.[0]?.title).toBe('DOOM (1993)')
  })

  it('reports a game that is gone', async () => {
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM)])
    expect(await handlers.rename({ id: ID_B, title: 'X' })).toMatchObject({
      saved: false,
      reason: 'notFound'
    })
  })

  it('confirms new arguments in main’s dialog before saving them', async () => {
    const confirmArgs = vi.fn(async () => false)
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM, '-fast')], { confirmArgs })
    expect(await handlers.setArgs('window', { id: ID_A, args: '-c "calc.exe"' })).toMatchObject({
      saved: false,
      reason: 'notConfirmed'
    })
    expect(confirmArgs).toHaveBeenCalledWith('window', DOOM, '-c "calc.exe"')
    expect(fileDeps.saved()?.[0]?.args).toBe('-fast')
  })

  it('saves cleared or unchanged arguments without asking', async () => {
    const confirmArgs = vi.fn(async () => false)
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM, '-fast')], { confirmArgs })
    expect((await handlers.setArgs('window', { id: ID_A, args: '-fast' })).saved).toBe(true)
    expect((await handlers.setArgs('window', { id: ID_A, args: '' })).saved).toBe(true)
    expect(confirmArgs).not.toHaveBeenCalled()
    expect(fileDeps.saved()?.[0]?.args).toBe('')
  })

  it('does not save confirmed arguments if the exe changed while the dialog was open', async () => {
    // Change .exe answers "busy" while a dialog is open, so this can only
    // happen from outside the handlers (a second app instance, a hand edit);
    // the save still checks.
    let fileRef: ReturnType<typeof memoryFile> | null = null
    const confirmArgs = vi.fn(async () => {
      await fileRef?.writeFile(JSON.stringify({ games: [saved(ID_A, 'Doom', QUAKE)] }))
      return true
    })
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)], { confirmArgs })
    fileRef = fileDeps
    expect(await handlers.setArgs('window', { id: ID_A, args: '-x' })).toMatchObject({
      saved: false,
      reason: 'notConfirmed'
    })
    expect(fileDeps.saved()?.[0]).toMatchObject({ exePath: QUAKE, args: '' })
  })

  it('answers busy to Change .exe while an arguments dialog is open', async () => {
    let handlersRef: ManualHandlers<Owner> | null = null
    let changeResult: unknown = null
    const confirmArgs = vi.fn(async () => {
      changeResult = await handlersRef?.changeExe('window', { id: ID_A })
      return true
    })
    const { handlers, deps } = setup([saved(ID_A, 'Doom', DOOM)], { confirmArgs })
    handlersRef = handlers
    expect((await handlers.setArgs('window', { id: ID_A, args: '-x' })).saved).toBe(true)
    expect(changeResult).toMatchObject({ saved: false, reason: 'busy' })
    expect(deps.pickExe).not.toHaveBeenCalled()
  })

  it('changes the exe and keeps the title, arguments and cover choice', async () => {
    const { handlers, picks, fileDeps } = setup([
      { ...saved(ID_A, 'Doom', DOOM, '-fast'), coverSource: 'icon' }
    ])
    picks.push('D:\\Doom\\doom.exe')
    expect((await handlers.changeExe('window', { id: ID_A })).saved).toBe(true)
    expect(fileDeps.saved()?.[0]).toEqual({
      ...saved(ID_A, 'Doom', 'D:\\Doom\\doom.exe', '-fast'),
      coverSource: 'icon'
    })
  })

  it.each([
    ['the dialog is closed', null, 'cancelled'],
    ['the file is not an .exe', 'D:\\doom.bat', 'notExe'],
    ['another manual game has that exe', QUAKE.toUpperCase(), 'duplicate']
  ])('leaves the exe alone when %s', async (_name, path, reason) => {
    const { handlers, picks, fileDeps } = setup([
      saved(ID_A, 'Doom', DOOM),
      saved(ID_B, 'Quake', QUAKE)
    ])
    picks.push(path)
    expect(await handlers.changeExe('window', { id: ID_A })).toMatchObject({ saved: false, reason })
    expect(fileDeps.saved()?.[0]?.exePath).toBe(DOOM)
  })

  it('lets a game keep its own exe (a re-pick of the same file)', async () => {
    const { handlers, picks } = setup([saved(ID_A, 'Doom', DOOM)])
    picks.push(DOOM)
    expect((await handlers.changeExe('window', { id: ID_A })).saved).toBe(true)
  })

  it('changes nothing while the saved list cannot be read', async () => {
    const { handlers, fileDeps, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    fileDeps.unreadable = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await handlers.rename({ id: ID_A, title: 'X' })).toMatchObject({ reason: 'unreadable' })
    expect(await handlers.setArgs('window', { id: ID_A, args: '-x' })).toMatchObject({
      reason: 'unreadable'
    })
    expect(await handlers.changeExe('window', { id: ID_A })).toMatchObject({ reason: 'unreadable' })
    expect(await handlers.remove({ id: ID_A })).toMatchObject({ reason: 'unreadable' })
    expect(deps.confirmArgs).not.toHaveBeenCalled()
    expect(deps.pickExe).not.toHaveBeenCalled()
    fileDeps.unreadable = false
    expect(fileDeps.saved()).toEqual([saved(ID_A, 'Doom', DOOM)])
    warn.mockRestore()
  })

  it.each([
    ['a non-UUID id', { id: '../../evil', title: 'X' }],
    ['an upper-case UUID', { id: ID_A.toUpperCase(), title: 'X' }],
    ['a control character in a title', { id: ID_A, title: 'Do\u0000om' }]
  ])('throws for %s (a caller bug)', async (_name, request) => {
    const { handlers } = setup([saved(ID_A, 'Doom', DOOM)])
    await expect(handlers.rename(request)).rejects.toThrow()
  })
})

describe('manual handlers: removing and launching', () => {
  it('removes the game, then its star', async () => {
    const { handlers, fileDeps, deps } = setup([
      saved(ID_A, 'Doom', DOOM),
      saved(ID_B, 'Quake', QUAKE)
    ])
    expect((await handlers.remove({ id: ID_A })).saved).toBe(true)
    expect(fileDeps.saved()?.map((g) => g.id)).toEqual([ID_B])
    expect(deps.removeFavorite).toHaveBeenCalledWith(`manual:${ID_A}`)
  })

  it('keeps the removal when dropping the star fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { handlers, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)], {
      removeFavorite: async () => Promise.reject(new Error('locked'))
    })
    expect((await handlers.remove({ id: ID_A })).saved).toBe(true)
    expect(fileDeps.saved()).toEqual([])
    warn.mockRestore()
  })

  it('does not touch the star of a game that was not removed', async () => {
    const { handlers, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    expect(await handlers.remove({ id: ID_B })).toMatchObject({ saved: false, reason: 'notFound' })
    expect(deps.removeFavorite).not.toHaveBeenCalled()
  })

  it('launches by id only', async () => {
    const { handlers, provider } = setup([saved(ID_A, 'Doom', DOOM)])
    expect(await handlers.launch({ id: ID_A })).toEqual({ accepted: true })
    expect(provider.launch).toHaveBeenCalledWith(ID_A)
    await expect(handlers.launch({ id: 'C:\\Windows\\System32\\cmd.exe' })).rejects.toThrow()
  })
})

describe('manual handlers: covers', () => {
  it('starts a cover sync when the list is read', async () => {
    const { handlers, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    await handlers.list()
    expect(deps.covers.requestSync).toHaveBeenCalled()
  })

  it('drops the Steam poster and app id on rename, so the new title is looked up', async () => {
    const { handlers, deps, fileDeps } = setup([
      { ...saved(ID_A, 'Doom', DOOM), steamAppId: '2280' }
    ])
    expect((await handlers.rename({ id: ID_A, title: 'My Doom Mod' })).saved).toBe(true)
    expect(deps.covers.dropPoster).toHaveBeenCalledWith(ID_A)
    expect(fileDeps.saved()?.[0]?.steamAppId).toBeUndefined()
    expect(deps.covers.requestSync).toHaveBeenCalled()
  })

  it('keeps the poster when a rename saves the same title', async () => {
    const { handlers, deps } = setup([{ ...saved(ID_A, 'Doom', DOOM), steamAppId: '2280' }])
    expect((await handlers.rename({ id: ID_A, title: 'Doom' })).saved).toBe(true)
    expect(deps.covers.dropPoster).not.toHaveBeenCalled()
  })

  it('lets the poster be looked up again when switched back to Steam cover', async () => {
    const { handlers, deps } = setup([{ ...saved(ID_A, 'Doom', DOOM), coverSource: 'icon' }])
    await handlers.setCoverSource({ id: ID_A, source: 'steam' })
    expect(deps.covers.retry).toHaveBeenCalledWith(ID_A)
  })

  it('saves the cover choice and keeps the files either way', async () => {
    const { handlers, deps, fileDeps } = setup([saved(ID_A, 'Doom', DOOM)])
    expect((await handlers.setCoverSource({ id: ID_A, source: 'icon' })).saved).toBe(true)
    expect(fileDeps.saved()?.[0]?.coverSource).toBe('icon')
    expect(deps.covers.dropPoster).not.toHaveBeenCalled()
    await expect(handlers.setCoverSource({ id: ID_A, source: 'poster' })).rejects.toThrow()
  })

  it('deletes both cover files when a game is removed', async () => {
    const { handlers, deps } = setup([saved(ID_A, 'Doom', DOOM)])
    await handlers.remove({ id: ID_A })
    expect(deps.covers.forget).toHaveBeenCalledWith(ID_A)
  })
})
