import type { z } from 'zod'
import {
  manualAddRequestSchema,
  manualIdRequestSchema,
  manualRenameRequestSchema,
  manualSetArgsRequestSchema,
  type ManualChangeFailure,
  type ManualChangeResult,
  type ManualGamesList,
  type ManualLaunchResult,
  type ManualPickResult
} from '@shared/ipc/manual'
import { gameKey } from '@shared/stores'
import type { DirectStoreProvider } from '../stores/store-provider'
import type { ManualGamesFile, SavedManualGame } from '../stores/manual'
import { isSamePath } from '../stores/manual/exe-path'
import type { ManualGamesEdit } from '../stores/manual/manual-games-file'

// The logic behind the manual-game channels (docs/features/library-tools.md,
// "Manual games"), free of Electron imports so it can be tested directly;
// ipc/manual.ts wires it to ipcMain and Electron's dialogs.
//
// Every path comes from main's own file dialog and stays in main. The
// renderer sends ids, titles and arguments only, and arguments are saved only
// after main's own confirmation dialog.

// `Owner` is whatever the dialogs need to know which window they belong to
// (a BrowserWindow in the app, anything in tests); passed through per call.
export interface ManualHandlerDeps<Owner> {
  file: ManualGamesFile
  provider: DirectStoreProvider
  // The native file dialog, limited to .exe files. null when closed.
  pickExe: (owner: Owner) => Promise<string | null>
  // The native "Save launch arguments for <exe>?" dialog: true for Save.
  confirmArgs: (owner: Owner, exePath: string, args: string) => Promise<boolean>
  isExeFile: (path: string) => Promise<boolean>
  // The picked file's real path (see exe-path.ts), which is what is saved.
  resolveExePath: (path: string) => Promise<string>
  suggestedTitle: (path: string) => string
  // Drops a removed game's star.
  removeFavorite: (key: string) => Promise<unknown>
  newId: () => string
}

export interface ManualHandlers<Owner> {
  list: () => Promise<ManualGamesList>
  pickExe: (owner: Owner) => Promise<ManualPickResult>
  add: (owner: Owner, rawRequest: unknown) => Promise<ManualChangeResult>
  cancelAdd: () => void
  rename: (rawRequest: unknown) => Promise<ManualChangeResult>
  setArgs: (owner: Owner, rawRequest: unknown) => Promise<ManualChangeResult>
  changeExe: (owner: Owner, rawRequest: unknown) => Promise<ManualChangeResult>
  remove: (rawRequest: unknown) => Promise<ManualChangeResult>
  launch: (rawRequest: unknown) => Promise<ManualLaunchResult>
}

const UNREADABLE: ManualGamesList = { readable: false, games: [] }

function toList(games: SavedManualGame[] | null): ManualGamesList {
  if (games === null) return UNREADABLE
  return {
    readable: true,
    // Never the path, nor the cover bookkeeping.
    games: games.map((game) => ({
      id: game.id,
      title: game.title,
      args: game.args,
      coverSource: game.coverSource
    }))
  }
}

// Only a caller bug gets here (the preload builds the payloads), so it throws
// rather than returning a message for the user.
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error('Invalid manual game request')
  return result.data
}

export function createManualHandlers<Owner>(deps: ManualHandlerDeps<Owner>): ManualHandlers<Owner> {
  // The .exe picked for the open Add form. One at a time: a new pick replaces
  // it. Kept here so the renderer never holds (or can swap in) a path.
  let pendingPick: string | null = null
  // One file or confirmation dialog at a time. Two file dialogs could
  // otherwise finish in either order, leaving the form showing one file's
  // title for another file; and a window that kept opening confirmation
  // dialogs could keep asking until the user clicked Save.
  let dialogOpen = false
  async function withDialog<T>(show: () => Promise<T>): Promise<T | 'busy'> {
    if (dialogOpen) return 'busy'
    dialogOpen = true
    try {
      return await show()
    } finally {
      dialogOpen = false
    }
  }

  // Whether resolved `exePath` is already another manual game (`exceptId` is
  // the game being changed). Saved paths were resolved when picked, so this
  // compares spellings only and never waits on a saved game's drive.
  function isDuplicate(games: SavedManualGame[], exePath: string, exceptId?: string): boolean {
    return games.some((game) => game.id !== exceptId && isSamePath(game.exePath, exePath))
  }

  // The picked file, resolved, if it is an .exe file. Checked after
  // resolving: a link named .exe that leads to a script is refused.
  async function resolvePicked(path: string): Promise<string | null> {
    const resolved = await deps.resolveExePath(path)
    return (await deps.isExeFile(resolved)) ? resolved : null
  }

  async function change<F extends ManualChangeFailure>(
    edit: (games: SavedManualGame[]) => Promise<ManualGamesEdit<F>>
  ): Promise<ManualChangeResult> {
    const result = await deps.file.update(edit)
    if (result.saved) return { saved: true, list: toList(result.games) }
    return { saved: false, reason: result.reason, list: toList(result.games) }
  }

  function findIndex(games: SavedManualGame[], id: string): number {
    return games.findIndex((game) => game.id === id)
  }

  return {
    list: async () => {
      const read = await deps.file.read()
      return read.readable ? toList(read.games) : UNREADABLE
    },

    pickExe: async (owner) => {
      // A new pick always starts from nothing: an earlier pick that was
      // never added (the form was closed some other way) can't be added
      // under this one's title.
      pendingPick = null
      const read = await deps.file.read()
      // Checked first, so the user isn't sent through a dialog for nothing.
      if (!read.readable) return { picked: false, reason: 'unreadable' }
      const path = await withDialog(() => deps.pickExe(owner))
      if (path === 'busy') return { picked: false, reason: 'busy' }
      if (path === null) return { picked: false, reason: 'cancelled' }
      const resolved = await resolvePicked(path)
      if (resolved === null) return { picked: false, reason: 'notExe' }
      if (isDuplicate(read.games, resolved)) return { picked: false, reason: 'duplicate' }
      pendingPick = resolved
      // From the name the user picked, not the resolved file's.
      return { picked: true, suggestedTitle: deps.suggestedTitle(path) }
    },

    add: async (owner, rawRequest) => {
      const request = parse(manualAddRequestSchema, rawRequest)
      const exePath = pendingPick
      if (exePath === null) {
        const read = await deps.file.read()
        return {
          saved: false,
          reason: 'noPick',
          list: read.readable ? toList(read.games) : UNREADABLE
        }
      }
      // Asked before taking the save queue: the dialog waits on the user.
      if (request.args !== '') {
        const confirmed = await withDialog(() => deps.confirmArgs(owner, exePath, request.args))
        if (confirmed !== true) {
          const read = await deps.file.read()
          return {
            saved: false,
            reason: confirmed === 'busy' ? 'busy' : 'notConfirmed',
            list: read.readable ? toList(read.games) : UNREADABLE
          }
        }
      }
      const result = await change<'duplicate' | 'noPick'>(async (games) => {
        // Another pick or add may have run while the dialog was open.
        if (pendingPick !== exePath) return { failure: 'noPick' }
        if (isDuplicate(games, exePath)) return { failure: 'duplicate' }
        const game: SavedManualGame = {
          id: deps.newId(),
          title: request.title,
          exePath,
          args: request.args,
          coverSource: 'steam'
        }
        return { games: [...games, game] }
      })
      if (result.saved) pendingPick = null
      return result
    },

    cancelAdd: () => {
      pendingPick = null
    },

    rename: async (rawRequest) => {
      const request = parse(manualRenameRequestSchema, rawRequest)
      return change<'notFound'>(async (games) => {
        const index = findIndex(games, request.id)
        if (index === -1) return { failure: 'notFound' }
        return {
          games: games.map((game, i) => (i === index ? { ...game, title: request.title } : game))
        }
      })
    },

    setArgs: async (owner, rawRequest) => {
      const request = parse(manualSetArgsRequestSchema, rawRequest)
      const read = await deps.file.read()
      if (!read.readable) return { saved: false, reason: 'unreadable', list: UNREADABLE }
      const current = read.games.find((game) => game.id === request.id)
      if (current === undefined)
        return { saved: false, reason: 'notFound', list: toList(read.games) }
      // Unchanged or cleared arguments need no confirmation: they can't make
      // the game run anything new.
      const needsConfirm = request.args !== '' && request.args !== current.args
      if (needsConfirm) {
        const confirmed = await withDialog(() =>
          deps.confirmArgs(owner, current.exePath, request.args)
        )
        if (confirmed !== true) {
          const reason = confirmed === 'busy' ? 'busy' : 'notConfirmed'
          return { saved: false, reason, list: toList(read.games) }
        }
      }
      return change<'notFound' | 'notConfirmed' | 'busy'>(async (games) => {
        const index = findIndex(games, request.id)
        if (index === -1) return { failure: 'notFound' }
        // The exe was changed while the dialog was open: what the user
        // confirmed was for the other one.
        if (needsConfirm && games[index]?.exePath !== current.exePath) {
          return { failure: 'notConfirmed' }
        }
        // Another save changed the arguments meanwhile: whether this one
        // needed confirming was decided against the old ones, so don't guess.
        if (games[index]?.args !== current.args) return { failure: 'busy' }
        return {
          games: games.map((game, i) => (i === index ? { ...game, args: request.args } : game))
        }
      })
    },

    changeExe: async (owner, rawRequest) => {
      const request = parse(manualIdRequestSchema, rawRequest)
      const read = await deps.file.read()
      if (!read.readable) return { saved: false, reason: 'unreadable', list: UNREADABLE }
      if (findIndex(read.games, request.id) === -1) {
        return { saved: false, reason: 'notFound', list: toList(read.games) }
      }
      const path = await withDialog(() => deps.pickExe(owner))
      if (path === 'busy') return { saved: false, reason: 'busy', list: toList(read.games) }
      if (path === null) return { saved: false, reason: 'cancelled', list: toList(read.games) }
      const resolved = await resolvePicked(path)
      if (resolved === null) return { saved: false, reason: 'notExe', list: toList(read.games) }
      return change<'notFound' | 'duplicate'>(async (games) => {
        const index = findIndex(games, request.id)
        if (index === -1) return { failure: 'notFound' }
        if (isDuplicate(games, resolved, request.id)) return { failure: 'duplicate' }
        // Title, arguments, star and cover choice stay (spec).
        return {
          games: games.map((game, i) => (i === index ? { ...game, exePath: resolved } : game))
        }
      })
    },

    remove: async (rawRequest) => {
      const request = parse(manualIdRequestSchema, rawRequest)
      const result = await change<'notFound'>(async (games) => {
        if (findIndex(games, request.id) === -1) return { failure: 'notFound' }
        return { games: games.filter((game) => game.id !== request.id) }
      })
      // The list is saved first; a star left behind by a failure here is
      // harmless (favorites ignore games that aren't shown).
      if (result.saved) {
        try {
          await deps.removeFavorite(gameKey('manual', request.id))
        } catch (err) {
          console.warn('[manual] could not drop a removed game’s star:', err)
        }
      }
      return result
    },

    launch: async (rawRequest) => {
      const request = parse(manualIdRequestSchema, rawRequest)
      return deps.provider.launch(request.id)
    }
  }
}
