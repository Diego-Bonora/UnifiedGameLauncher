import { describe, expect, it } from 'vitest'
import type { ManualGameView, ManualGamesList } from '@shared/ipc/manual-channels'
import { nextManualList } from './manual-view'

const game = (overrides: Partial<ManualGameView> = {}): ManualGameView => ({
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  title: 'Doom (1993)',
  args: '',
  coverSource: 'steam',
  posterUrl: null,
  iconUrl: null,
  ...overrides
})
const list = (...games: ManualGameView[]): ManualGamesList => ({
  readable: true,
  coversReadable: true,
  games
})
// Main couldn't list the covers folder: every URL is null for that reason.
const coversLocked = (...games: ManualGameView[]): ManualGamesList => ({
  ...list(...games),
  coversReadable: false
})

const POSTER = 'app-cover://manual/0f8fad5b-d9cb-469f-a165-70867728950e-poster?v=1'
const ICON = 'app-cover://manual/0f8fad5b-d9cb-469f-a165-70867728950e-icon?v=1'

describe('nextManualList', () => {
  const shown = list(game({ posterUrl: POSTER, iconUrl: ICON }))

  it("shows main's answer as it is when the covers folder was read", () => {
    const next = list(game({ args: '-windowed' }))
    expect(nextManualList(shown, next)).toBe(next)
  })

  it('lets main remove a cover under the same title (an invalidated poster, a re-read icon)', () => {
    const next = nextManualList(shown, list(game()))
    expect(next.games[0]?.posterUrl).toBeNull()
    expect(next.games[0]?.iconUrl).toBeNull()
  })

  it('keeps the shown poster and icon while the covers folder cannot be listed', () => {
    const next = nextManualList(shown, coversLocked(game({ args: '-windowed' })))
    expect(next.games[0]).toEqual(game({ args: '-windowed', posterUrl: POSTER, iconUrl: ICON }))
  })

  it('still drops the poster of a renamed game then, since it was found for the old title', () => {
    const renamed = nextManualList(shown, coversLocked(game({ title: 'Doom II' })))
    expect(renamed.games[0]?.posterUrl).toBeNull()
    // The icon comes from the exe, which a rename doesn't touch.
    expect(renamed.games[0]?.iconUrl).toBe(ICON)
  })

  it('never carries covers over to another game or back to a removed one', () => {
    const other = game({ id: 'a6c1e4b2-0000-4000-8000-000000000000' })
    expect(nextManualList(shown, coversLocked(other)).games).toEqual([other])
    expect(nextManualList(shown, coversLocked()).games).toEqual([])
  })

  it('passes an unreadable list through', () => {
    const unreadable: ManualGamesList = { readable: false, coversReadable: true, games: [] }
    expect(nextManualList(shown, unreadable)).toBe(unreadable)
  })
})
