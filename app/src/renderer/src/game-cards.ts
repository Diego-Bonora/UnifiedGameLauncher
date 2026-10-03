import type { EpicInstalledGame } from '@shared/ipc/epic-channels'
import type { SteamInstalledGame, SteamOwnedGame } from '@shared/ipc/steam-channels'
import { STORES, type StoreId } from '@shared/stores'

// Pure logic for the game views (docs/features/library-layout.md), kept out of
// the components so it can be unit tested.

// "All games", or one store's own view.
export type LibraryView = 'all' | StoreId

// One poster in a grid, whatever store it comes from.
export interface GameCard {
  // `<store>:<id>`: ids from different stores can collide, so the bare id is
  // never used as a React key or to tell cards apart.
  key: string
  store: StoreId
  // The store's own id: Steam appId, Epic AppName.
  id: string
  title: string
  coverUrl: string | null
}

export interface ViewSections {
  installed: GameCard[]
  // null when no store in the view can list owned-but-not-installed games
  // (the Epic view), so there is no Library section at all, not an empty one.
  library: GameCard[] | null
}

export interface LibraryData {
  steamInstalled: SteamInstalledGame[]
  // null while there is no owned library to show (not connected, no key, or
  // still loading): installed Steam games then show placeholders.
  steamOwned: SteamOwnedGame[] | null
  epicInstalled: EpicInstalledGame[]
}

export function cardKey(store: StoreId, id: string): string {
  return `${store}:${id}`
}

function card(store: StoreId, id: string, title: string, coverUrl: string | null): GameCard {
  return { key: cardKey(store, id), store, id, title, coverUrl }
}

// By title, ignoring case and accents ("ö" next to "o"), stores mixed. The key
// breaks ties so two games with the same title don't swap places between
// renders.
function byTitle(a: GameCard, b: GameCard): number {
  return (
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : 1)
  )
}

function inView(view: LibraryView, store: StoreId): boolean {
  return view === 'all' || view === store
}

export function viewHasLibrary(view: LibraryView): boolean {
  return STORES.some((store) => store.hasLibrary && inView(view, store.id))
}

export function buildViewSections(view: LibraryView, data: LibraryData): ViewSections {
  const installed: GameCard[] = []
  const installedSteamIds = new Set(data.steamInstalled.map((game) => game.appId))

  if (inView(view, 'steam')) {
    // Installed games have no cover of their own: they borrow the owned
    // library's. A game that isn't in the owned list (family sharing, a free
    // game never played) or no owned list yet means a title placeholder.
    const ownedCovers = new Map((data.steamOwned ?? []).map((game) => [game.appId, game.coverUrl]))
    for (const game of data.steamInstalled) {
      installed.push(card('steam', game.appId, game.title, ownedCovers.get(game.appId) ?? null))
    }
  }
  if (inView(view, 'epic')) {
    for (const game of data.epicInstalled) {
      installed.push(card('epic', game.appName, game.title, game.coverUrl))
    }
  }

  if (!viewHasLibrary(view)) return { installed: installed.sort(byTitle), library: null }

  // Steam is the only store with an owned library today. Checked per store
  // like Installed above, so a second store with a library can't end up
  // showing Steam's games in its own view.
  const library = inView(view, 'steam')
    ? (data.steamOwned ?? [])
        .filter((game) => !installedSteamIds.has(game.appId))
        .map((game) => card('steam', game.appId, game.title, game.coverUrl))
    : []

  return { installed: installed.sort(byTitle), library: library.sort(byTitle) }
}
