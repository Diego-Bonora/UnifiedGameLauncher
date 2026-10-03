import type { GameCard, ViewSections } from './game-cards'

// Search by name (docs/features/library-tools.md, "Search"). Pure, so it can
// be unit tested, and run on sections that are already built and sorted:
// filtering keeps the order, so search never changes the section rules.

// Epic titles keep their trademark signs ("Rocket League®"); nobody types them.
const TRADEMARK_SIGNS = /[®™©]/g
// Combining marks left over after NFD splits "é" into "e" + accent.
const COMBINING_MARKS = /\p{M}/gu
// Letters NFD can't split into a base letter and a mark, which people still
// read as accented ("Øri" found by "ori"), and curly apostrophes, which store
// titles use and keyboards don't type. Lower case only: applied after
// toLowerCase.
const FOLDS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ı: 'i',
  '’': "'",
  '‘': "'",
  ʼ: "'"
}
const FOLDED_CHARS = new RegExp(`[${Object.keys(FOLDS).join('')}]`, 'g')

// The form both the title and the query are compared in: lower case, no
// accents, no trademark signs. "Pokémon™" and "pokemon" both become "pokemon".
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(TRADEMARK_SIGNS, '')
    .toLowerCase()
    .replace(FOLDED_CHARS, (char) => FOLDS[char] ?? char)
}

// The query as it is matched: an empty result means "no search".
export function searchTerm(query: string): string {
  return normalizeForSearch(query).trim()
}

function matches(card: GameCard, term: string): boolean {
  return normalizeForSearch(card.title).includes(term)
}

// Both sections, filtered by the same query. A view with no Library section
// keeps it null: search must not make an empty Library heading appear.
export function filterSections(sections: ViewSections, query: string): ViewSections {
  const term = searchTerm(query)
  if (term === '') return sections
  return {
    installed: sections.installed.filter((card) => matches(card, term)),
    library: sections.library?.filter((card) => matches(card, term)) ?? null
  }
}

export function countCards(sections: ViewSections): number {
  return sections.installed.length + (sections.library?.length ?? 0)
}

// The polite announcement after typing stops, so a screen reader user knows
// whether the grid below changed.
export function matchCountMessage(count: number): string {
  if (count === 0) return 'No games found'
  return count === 1 ? '1 game found' : `${count} games found`
}

// Quoted as typed (trimmed), not normalized: it echoes the user's own words.
export function noMatchMessage(section: 'installed' | 'library', query: string): string {
  const quoted = `“${query.trim()}”`
  return section === 'installed'
    ? `No installed games match ${quoted}.`
    : `No games in your library match ${quoted}.`
}
