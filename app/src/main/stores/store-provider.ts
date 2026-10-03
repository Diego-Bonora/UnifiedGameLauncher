import type { StoreId } from '@shared/stores'

// The shape every store folder under main/stores/ implements, so the IPC
// layer and (later) the library cache can treat stores interchangeably.
export interface InstalledGame {
  storeGameId: string
  title: string
  installPath: string
  // Epic only. Not used to launch yet (AppName is), but carried now so the
  // launch URL can switch to Epic's namespace:itemId:appName form without
  // widening this shared type later.
  catalogNamespace?: string
  catalogItemId?: string
}

// What every store folder under main/stores/ provides.
interface StoreProviderBase {
  readonly store: StoreId
  getInstalledGames(): Promise<InstalledGame[]>
}

// A store whose own launcher does the work (Steam, Epic): the app only hands
// it a protocol URL.
export interface UrlStoreProvider extends StoreProviderBase {
  readonly launchesBy: 'url'
  // Returns the protocol URL to open, rather than launching directly, so the
  // allow-list check (security/external-url.ts) stays centralized in the IPC
  // handler instead of being duplicated per store.
  getLaunchUrl(storeGameId: string): string
  // Only for stores whose launcher can install a game from a URL (Steam).
  // Same reason as getLaunchUrl for returning a URL.
  getInstallUrl?(storeGameId: string): string
}

// Why a direct launch didn't start (see ManualLaunchFailure for the wording).
export type DirectLaunchFailure = 'notFound' | 'missing' | 'refused' | 'unreadable' | 'failed'
export type DirectLaunchResult =
  { accepted: true } | { accepted: false; reason: DirectLaunchFailure }

// A store with no launcher of its own (manual games): main starts the game
// itself, from data only main holds. The renderer can name a game, never a
// program to run.
//
// Its getInstalledGames rejects when the store's own records can't be read
// (never "no games": a cleanup acting on that would delete real data), and
// its installPath is for main only: it can be the exe itself, which never
// goes to the renderer.
export interface DirectStoreProvider extends StoreProviderBase {
  readonly launchesBy: 'direct'
  launch(storeGameId: string): Promise<DirectLaunchResult>
}

export type StoreProvider = UrlStoreProvider | DirectStoreProvider
