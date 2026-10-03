// Channel names and plain types only, no validation library import: this file
// is pulled into the sandboxed preload bundle, which can't require npm
// packages (see steam-channels.ts). The zod checks live in manual.ts, which
// only main imports.
//
// Manual games (docs/features/library-tools.md, "Manual games"). The renderer
// never sends or receives an exe path: main picks it in a native dialog,
// keeps it, and runs it. The renderer only ever names a game by its id.
export const MANUAL_CHANNELS = {
  list: 'manual:list',
  // Opens the native file dialog; main keeps the picked path until add or
  // cancelAdd.
  pickExe: 'manual:pickExe',
  add: 'manual:add',
  cancelAdd: 'manual:cancelAdd',
  rename: 'manual:rename',
  setArgs: 'manual:setArgs',
  changeExe: 'manual:changeExe',
  remove: 'manual:remove',
  launch: 'manual:launch'
} as const

export type ManualCoverSource = 'steam' | 'icon'

export const MAX_TITLE_LENGTH = 200
export const MAX_ARGS_LENGTH = 1000

// Character rules, here (no dependencies) so the renderer's forms can check
// them before sending, and main's zod schemas (manual.ts) use the same ones.
//
// Arguments: only characters that show as themselves. They are confirmed in
// main's dialog, the one guard against a compromised window, so what the
// dialog shows must be exactly what is saved: no control or format
// characters at all (line breaks, NUL, zero-width spaces, the right-to-left
// override that can show "--gpu-launcher=…" backwards), and no line or
// paragraph separators.
const HIDDEN_IN_ARGS = /[\p{C}\p{Zl}\p{Zp}]/u

// Titles: no control characters, direction overrides or line separators
// (main shows titles in its messages), but the joiners real writing needs
// stay allowed: Persian and Indic spelling use U+200C, emoji sequences such
// as families and flags use U+200D.
const HIDDEN_IN_TITLES =
  /[\p{Cc}\p{Co}\p{Cs}\p{Zl}\p{Zp}\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u

export function hasValidArgsCharacters(args: string): boolean {
  return !HIDDEN_IN_ARGS.test(args)
}

export function hasValidTitleCharacters(title: string): boolean {
  return !HIDDEN_IN_TITLES.test(title)
}

// One manual game as the renderer sees it: no exe path.
export interface ManualGameView {
  // A UUID made by main.
  id: string
  title: string
  // Shown in the edit form. The user typed them, and they can only be
  // changed through main's own confirmation dialog.
  args: string
  coverSource: ManualCoverSource
}

// `readable: false` means manual-games.json exists but couldn't be read (for
// example locked by OneDrive): the list is then empty and nothing may be
// changed until a read works, so a bad read can't wipe the saved games.
export interface ManualGamesList {
  readable: boolean
  games: ManualGameView[]
}

//  - cancelled: the user closed the file dialog
//  - notExe: the picked file isn't an .exe file (a shortcut, a folder)
//  - duplicate: that .exe is already a manual game
//  - unreadable: the saved list can't be read, so nothing can be added
//  - busy: another file or confirmation dialog is already open
export type ManualPickResult =
  | { picked: true; suggestedTitle: string }
  | { picked: false; reason: 'cancelled' | 'notExe' | 'duplicate' | 'unreadable' | 'busy' }

export interface ManualAddRequest {
  title: string
  args: string
}

export interface ManualRenameRequest {
  id: string
  title: string
}

export interface ManualSetArgsRequest {
  id: string
  args: string
}

export interface ManualIdRequest {
  id: string
}

// Expected outcomes of a change, as data (never a thrown message):
//  - notConfirmed: the user chose Cancel in main's arguments dialog
//  - cancelled: the user closed the file dialog (Change .exe)
//  - noPick: add was called without a pending pick (it was cancelled or used)
//  - notExe / duplicate: as for ManualPickResult (Change .exe)
//  - notFound: no manual game with that id (removed meanwhile)
//  - unreadable: the saved list can't be read, so nothing is changed
//  - cannotSave: writing manual-games.json failed
//  - busy: another dialog is open, or the game changed while this one was
//    waiting; nothing was saved, try again
export type ManualChangeFailure =
  | 'busy'
  | 'notConfirmed'
  | 'cancelled'
  | 'noPick'
  | 'notExe'
  | 'duplicate'
  | 'notFound'
  | 'unreadable'
  | 'cannotSave'

// `list` is the saved list after the request, changed or not.
export type ManualChangeResult =
  | { saved: true; list: ManualGamesList }
  | { saved: false; reason: ManualChangeFailure; list: ManualGamesList }

// Same shape as the Steam and Epic results, so the one app-wide pause and
// message line handle all three.
//  - notFound: no manual game with that id (removed meanwhile)
//  - missing: the saved .exe isn't there any more
//  - refused: Windows wouldn't start it (access denied, which includes an exe
//    that needs administrator rights)
//  - unreadable: the saved list can't be read, so the game can't be looked up
//  - failed: any other start failure
export type ManualLaunchFailure = 'notFound' | 'missing' | 'refused' | 'unreadable' | 'failed'
export type ManualLaunchResult =
  { accepted: true } | { accepted: false; reason: ManualLaunchFailure }
