import { describe, expect, it } from 'vitest'
import { cardKey, type GameCard, type ViewSections } from './game-cards'
import {
  countCards,
  filterSections,
  matchCountMessage,
  noMatchMessage,
  normalizeForSearch,
  searchTerm
} from './game-search'

const card = (store: 'steam' | 'epic', id: string, title: string): GameCard => ({
  key: cardKey(store, id),
  store,
  id,
  title,
  coverUrl: null
})

const sections: ViewSections = {
  installed: [
    card('epic', 'Sugar', 'Rocket League®'),
    card('steam', '440', 'Team Fortress 2'),
    card('steam', '1', 'Pokémon™ Puzzle')
  ],
  library: [card('steam', '570', 'Dota 2'), card('steam', '10', 'Counter-Strike')]
}

const titles = (cards: GameCard[] | null): string[] | null =>
  cards === null ? null : cards.map((c) => c.title)

describe('normalizeForSearch', () => {
  it('drops case, accents and trademark signs', () => {
    expect(normalizeForSearch('Pokémon™ Puzzle')).toBe('pokemon puzzle')
    expect(normalizeForSearch('Rocket League®')).toBe('rocket league')
    expect(normalizeForSearch('ÉLAN © Co')).toBe('elan  co')
  })

  it('folds letters NFD keeps whole, and curly apostrophes', () => {
    expect(normalizeForSearch('Øri Æon Œuvre Straße Łódź Đura')).toBe(
      'ori aeon oeuvre strasse lodz dura'
    )
    expect(normalizeForSearch('Assassin’s Creed')).toBe("assassin's creed")
  })
})

describe('searchTerm', () => {
  it('trims spaces, so a blank query means no search', () => {
    expect(searchTerm('  Dota ')).toBe('dota')
    expect(searchTerm('   ')).toBe('')
  })
})

describe('filterSections', () => {
  it('returns the same sections for an empty or blank query', () => {
    expect(filterSections(sections, '')).toBe(sections)
    expect(filterSections(sections, '  ')).toBe(sections)
  })

  it('matches anywhere in the title, ignoring case', () => {
    const result = filterSections(sections, 'FORTRESS')
    expect(titles(result.installed)).toEqual(['Team Fortress 2'])
    expect(titles(result.library)).toEqual([])
  })

  it('finds a curly-apostrophe title with a typed apostrophe', () => {
    const withApostrophe: ViewSections = {
      installed: [card('steam', '2', 'Assassin’s Creed')],
      library: null
    }
    expect(titles(filterSections(withApostrophe, "assassin's").installed)).toEqual([
      'Assassin’s Creed'
    ])
  })

  it('ignores accents and trademark signs on either side', () => {
    expect(titles(filterSections(sections, 'pokemon').installed)).toEqual(['Pokémon™ Puzzle'])
    expect(titles(filterSections(sections, 'Pokémon').installed)).toEqual(['Pokémon™ Puzzle'])
    expect(titles(filterSections(sections, 'league®').installed)).toEqual(['Rocket League®'])
  })

  it('filters Installed and Library with the same query, keeping their order', () => {
    const result = filterSections(sections, '2')
    expect(titles(result.installed)).toEqual(['Team Fortress 2'])
    expect(titles(result.library)).toEqual(['Dota 2'])
  })

  it('keeps a missing Library section missing', () => {
    const epicOnly: ViewSections = { installed: sections.installed, library: null }
    expect(filterSections(epicOnly, 'rocket').library).toBeNull()
    expect(filterSections(epicOnly, 'nothing').library).toBeNull()
  })
})

describe('countCards', () => {
  it('counts both sections, and a view without Library', () => {
    expect(countCards(sections)).toBe(5)
    expect(countCards({ installed: sections.installed, library: null })).toBe(3)
  })
})

describe('messages', () => {
  it('announces the match count', () => {
    expect(matchCountMessage(0)).toBe('No games found')
    expect(matchCountMessage(1)).toBe('1 game found')
    expect(matchCountMessage(12)).toBe('12 games found')
  })

  it('quotes the query as typed, trimmed', () => {
    expect(noMatchMessage('installed', ' Hálo ')).toBe('No installed games match “Hálo”.')
    expect(noMatchMessage('library', 'halo')).toBe('No games in your library match “halo”.')
  })
})
