import { describe, expect, it, vi } from 'vitest'
import {
  createManualGamesFile,
  type ManualGamesFileDeps,
  type SavedManualGame
} from './manual-games-file'

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

function fakeFile(initial?: string): ManualGamesFileDeps & {
  content: () => string | undefined
  readError: NodeJS.ErrnoException | null
  failWrites: boolean
} {
  let content = initial
  const file = {
    readError: null as NodeJS.ErrnoException | null,
    failWrites: false,
    content: () => content,
    readFile: async (): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (file.readError) throw file.readError
      if (content === undefined) throw errno('ENOENT')
      return content
    },
    writeFile: async (data: string): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (file.failWrites) throw new Error('disk full')
      content = data
    }
  }
  return file
}

const game = (id: string, title: string): SavedManualGame => ({
  id,
  title,
  exePath: `C:\\Games\\${title}\\game.exe`,
  args: '',
  coverSource: 'steam'
})
const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const saved = (games: unknown[]): string => JSON.stringify({ games })
const add =
  (g: SavedManualGame) =>
  async (games: SavedManualGame[]): Promise<{ games: SavedManualGame[] }> => ({
    games: [...games, g]
  })

describe('manual-games-file', () => {
  it('has no games when the file does not exist yet', async () => {
    expect(await createManualGamesFile(fakeFile()).read()).toEqual({ readable: true, games: [] })
  })

  it('saves a change and reads it back', async () => {
    const file = createManualGamesFile(fakeFile())
    expect(await file.update(add(game(ID_A, 'Doom')))).toEqual({
      saved: true,
      games: [game(ID_A, 'Doom')]
    })
    expect(await file.read()).toEqual({ readable: true, games: [game(ID_A, 'Doom')] })
  })

  it('reports an edit that decides not to change anything, without writing', async () => {
    const deps = fakeFile(saved([game(ID_A, 'Doom')]))
    const before = deps.content()
    const result = await createManualGamesFile(deps).update(async () => ({ failure: 'notFound' }))
    expect(result).toEqual({ saved: false, reason: 'notFound', games: [game(ID_A, 'Doom')] })
    expect(deps.content()).toBe(before)
  })

  it.each([
    ['locked by another program', null, 'EBUSY'],
    ['not valid JSON', '{ "games": [', null],
    ['the wrong shape', JSON.stringify({ games: 'Doom' }), null],
    ['a game with a bad id', saved([{ ...game(ID_A, 'Doom'), id: '../evil' }]), null],
    ['two games with one id', saved([game(ID_A, 'Doom'), game(ID_A, 'Quake')]), null],
    ['arguments with a line break', saved([{ ...game(ID_A, 'Doom'), args: '-a\n-b' }]), null],
    ['a title that is too long', saved([{ ...game(ID_A, 'Doom'), title: 'x'.repeat(201) }]), null]
  ])('never writes over a file that is %s', async (_name, content, readCode) => {
    const original = content ?? saved([game(ID_A, 'Doom')])
    const deps = fakeFile(original)
    if (readCode !== null) deps.readError = errno(readCode)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const file = createManualGamesFile(deps)
    expect(await file.read()).toEqual({ readable: false })
    const edit = vi.fn(add(game(ID_B, 'Quake')))
    expect(await file.update(edit)).toEqual({ saved: false, reason: 'unreadable', games: null })
    expect(edit).not.toHaveBeenCalled()
    expect(deps.content()).toBe(original)
    warn.mockRestore()
  })

  it('keeps fields it does not know (from a later version) through a save', async () => {
    const deps = fakeFile(saved([{ ...game(ID_A, 'Doom'), playtime: 42 }]))
    await createManualGamesFile(deps).update(add(game(ID_B, 'Quake')))
    expect(JSON.parse(deps.content() ?? '').games[0].playtime).toBe(42)
  })

  it('reports a failed write with the list as saved', async () => {
    const deps = fakeFile(saved([game(ID_A, 'Doom')]))
    deps.failWrites = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await createManualGamesFile(deps).update(add(game(ID_B, 'Quake')))).toEqual({
      saved: false,
      reason: 'cannotSave',
      games: [game(ID_A, 'Doom')]
    })
    warn.mockRestore()
  })

  it('runs changes one after another, so none is lost', async () => {
    const file = createManualGamesFile(fakeFile())
    await Promise.all([file.update(add(game(ID_A, 'Doom'))), file.update(add(game(ID_B, 'Quake')))])
    const read = await file.read()
    expect(read.readable && read.games.map((g) => g.title)).toEqual(['Doom', 'Quake'])
  })
})
