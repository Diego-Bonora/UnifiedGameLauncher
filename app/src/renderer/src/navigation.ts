import { STORES } from '@shared/stores'
import type { LibraryView } from './game-cards'

// What the content area shows: one of the game views, or Settings.
export type Screen = LibraryView | 'settings'

export interface NavEntry {
  screen: LibraryView
  label: string
}

// The sidebar's game views: All games first, then one per supported store in
// the shared list's order. Built from that list, so a new integration gets its
// entry without touching the sidebar. Every supported store is listed, even
// before it's set up: its view says what to do.
export const LIBRARY_ENTRIES: readonly NavEntry[] = [
  { screen: 'all', label: 'All games' },
  ...STORES.map((store) => ({ screen: store.id, label: store.name }))
]

export function screenLabel(screen: Screen): string {
  if (screen === 'settings') return 'Settings'
  return LIBRARY_ENTRIES.find((entry) => entry.screen === screen)?.label ?? 'All games'
}
