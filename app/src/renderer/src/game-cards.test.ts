import { describe, expect, it } from 'vitest'
import type { EpicInstalledGame } from '@shared/ipc/epic-channels'
import type { ManualGameView } from '@shared/ipc/manual-channels'
import type { SteamInstalledGame, SteamOwnedGame } from '@shared/ipc/steam-channels'
import { buildViewSections, focusAfterChange, viewHasLibrary, type LibraryData } from './game-cards'

const installed = (
  appId: string,
  title: string,
  coverUrl: string | null = null
): SteamInstalledGame => ({
  appId,
  title,
  installPath: `c:\\steam\\steamapps\\common\\${title}`,
  libraryPath: 'c:\\steam',
  coverUrl
})
const owned = (appId: string, title: string): SteamOwnedGame => ({
  appId,
  title,
  coverUrl: `app-cover://covers/${appId}`
})
const epic = (
  appName: string,
  title: string,
  coverUrl: string | null = null
): EpicInstalledGame => ({
  appName,
  title,
  installPath: `C:\\Epic\\${title}`,
  coverUrl
})

const data: LibraryData = {
  steamInstalled: [installed('440', 'Team Fortress 2'), installed('999', 'Family Shared Game')],
  steamOwned: [
    owned('440', 'Team Fortress 2'),
    owned('570', 'Dota 2'),
    owned('10', 'Counter-Strike')
  ],
  epicInstalled: [
    epic('Sugar', 'Rocket League®', 'app-cover://epic/Sugar'),
    epic('Bloons', 'Bloons TD 6')
  ],
  manualGames: [],
  favorites: new Set()
}

const titles = (cards: { title: string }[] | null): string[] | null =>
  cards === null ? null : cards.map((card) => card.title)

describe('buildViewSections', () => {
  it('puts every installed game in Installed and the rest of Steam in Library, by title', () => {
    const sections = buildViewSections('all', data)
    expect(titles(sections.installed)).toEqual([
      'Bloons TD 6',
      'Family Shared Game',
      'Rocket League®',
      'Team Fortress 2'
    ])
    expect(titles(sections.library)).toEqual(['Counter-Strike', 'Dota 2'])
  })

  it('never shows a game in both sections', () => {
    const { installed: inst, library } = buildViewSections('all', data)
    const keys = [...inst, ...(library ?? [])].map((card) => card.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('limits a store view to that store', () => {
    const steam = buildViewSections('steam', data)
    expect(steam.installed.every((card) => card.store === 'steam')).toBe(true)
    expect(titles(steam.library)).toEqual(['Counter-Strike', 'Dota 2'])
  })

  it('gives the Epic view no Library section at all', () => {
    const epicView = buildViewSections('epic', data)
    expect(titles(epicView.installed)).toEqual(['Bloons TD 6', 'Rocket League®'])
    expect(epicView.library).toBeNull()
    expect(viewHasLibrary('epic')).toBe(false)
    expect(viewHasLibrary('steam')).toBe(true)
    expect(viewHasLibrary('all')).toBe(true)
  })

  it("borrows the owned library's cover for an installed Steam game, else a placeholder", () => {
    const covers = Object.fromEntries(
      buildViewSections('steam', data).installed.map((card) => [card.id, card.coverUrl])
    )
    expect(covers).toEqual({ '440': 'app-cover://covers/440', '999': null })
  })

  it('shows installed Steam games with placeholders and an empty Library before any owned list', () => {
    const sections = buildViewSections('all', { ...data, steamOwned: null })
    expect(sections.installed.filter((card) => card.store === 'steam')).toHaveLength(2)
    expect(
      sections.installed.every((card) => card.store !== 'steam' || card.coverUrl === null)
    ).toBe(true)
    expect(sections.library).toEqual([])
  })

  it('keys cards by store so equal ids from two stores stay apart', () => {
    const clash: LibraryData = {
      steamInstalled: [installed('123', 'Same Id')],
      steamOwned: null,
      epicInstalled: [epic('123', 'Same Id')],
      manualGames: [],
      favorites: new Set()
    }
    const keys = buildViewSections('all', clash).installed.map((card) => card.key)
    expect(keys.sort()).toEqual(['epic:123', 'steam:123'])
  })

  it('sorts ignoring case, with a stable order for equal titles', () => {
    const mixed: LibraryData = {
      steamInstalled: [installed('2', 'alpha'), installed('1', 'Beta')],
      steamOwned: null,
      epicInstalled: [epic('A', 'Alpha')],
      manualGames: [],
      favorites: new Set()
    }
    const once = buildViewSections('all', mixed).installed.map((card) => card.key)
    expect(once).toEqual(['epic:A', 'steam:2', 'steam:1'])
    const reversed: LibraryData = {
      ...mixed,
      steamInstalled: [...mixed.steamInstalled].reverse()
    }
    expect(buildViewSections('all', reversed).installed.map((card) => card.key)).toEqual(once)
  })
})

describe('buildViewSections: manual games', () => {
  const manual = (id: string, title: string): ManualGameView => ({
    id,
    title,
    args: '',
    coverSource: 'steam',
    posterUrl: null,
    iconUrl: null
  })
  const withManual = {
    ...data,
    manualGames: [manual('0f8fad5b-d9cb-469f-a165-70867728950e', 'Doom (1993)')]
  }

  it('lists manual games as installed, in All games and the Manual view only', () => {
    expect(titles(buildViewSections('manual', withManual).installed)).toEqual(['Doom (1993)'])
    expect(buildViewSections('manual', withManual).library).toBeNull()
    expect(titles(buildViewSections('all', withManual).installed)).toContain('Doom (1993)')
    expect(titles(buildViewSections('steam', withManual).installed)).not.toContain('Doom (1993)')
    expect(titles(buildViewSections('epic', withManual).installed)).not.toContain('Doom (1993)')
  })

  it('keys them by store like every other card', () => {
    const card = buildViewSections('manual', withManual).installed[0]
    expect(card?.key).toBe('manual:0f8fad5b-d9cb-469f-a165-70867728950e')
    expect(card?.store).toBe('manual')
  })

  it('does not add a Library section to All games for them', () => {
    expect(titles(buildViewSections('all', withManual).library)).toEqual([
      'Counter-Strike',
      'Dota 2'
    ])
  })
})

describe('buildViewSections: favorites', () => {
  it('puts starred games first in each section, then by title', () => {
    const starred = { ...data, favorites: new Set(['epic:Bloons', 'steam:570', 'steam:999']) }
    const sections = buildViewSections('all', starred)
    expect(titles(sections.installed)).toEqual([
      'Bloons TD 6',
      'Family Shared Game',
      'Rocket League®',
      'Team Fortress 2'
    ])
    expect(titles(sections.library)).toEqual(['Dota 2', 'Counter-Strike'])
  })

  it('sorts several starred games by title among themselves', () => {
    const starred = { ...data, favorites: new Set(['steam:440', 'epic:Sugar']) }
    expect(titles(buildViewSections('all', starred).installed)).toEqual([
      'Rocket League®',
      'Team Fortress 2',
      'Bloons TD 6',
      'Family Shared Game'
    ])
  })

  it('ignores a star for a game that is not shown', () => {
    const starred = { ...data, favorites: new Set(['steam:12345', 'gog:1']) }
    expect(buildViewSections('all', starred)).toEqual(buildViewSections('all', data))
  })
})

describe('buildViewSections: covers for installed games that are not owned', () => {
  it("uses main's own cover when the owned list has none for the game", () => {
    const freeGame = installed('230410', 'Warframe', 'app-cover://covers/230410')
    const sections = buildViewSections('steam', { ...data, steamInstalled: [freeGame] })
    expect(sections.installed[0]?.coverUrl).toBe('app-cover://covers/230410')
  })

  it("prefers the owned library's cover when both exist", () => {
    const tf2 = installed('440', 'Team Fortress 2', 'app-cover://covers/440-own')
    const sections = buildViewSections('steam', { ...data, steamInstalled: [tf2] })
    expect(sections.installed[0]?.coverUrl).toBe('app-cover://covers/440')
  })

  it('uses it before any owned list exists too', () => {
    const freeGame = installed('230410', 'Warframe', 'app-cover://covers/230410')
    const sections = buildViewSections('steam', {
      ...data,
      steamOwned: null,
      steamInstalled: [freeGame]
    })
    expect(sections.installed[0]?.coverUrl).toBe('app-cover://covers/230410')
  })
})

describe('focusAfterChange', () => {
  const sections = buildViewSections('all', data)

  it('leaves focus alone when the card is still in its section', () => {
    expect(focusAfterChange({ key: 'steam:440', section: 'installed' }, sections)).toBeNull()
    expect(focusAfterChange({ key: 'steam:570', section: 'library' }, sections)).toBeNull()
  })

  it('follows a card that moved to the other section', () => {
    // As if Team Fortress 2 had just been installed and Dota 2 uninstalled.
    expect(focusAfterChange({ key: 'steam:440', section: 'library' }, sections)).toBe('installed')
    expect(focusAfterChange({ key: 'steam:570', section: 'installed' }, sections)).toBe('library')
  })

  it('stays in the old section when the card is gone', () => {
    expect(focusAfterChange({ key: 'epic:Gone', section: 'installed' }, sections)).toBe('installed')
  })

  it('never points at a Library section the view does not have', () => {
    const epicOnly = buildViewSections('epic', data)
    expect(focusAfterChange({ key: 'steam:570', section: 'installed' }, epicOnly)).toBe('installed')
  })
})
