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

export interface StoreProvider {
  readonly store: 'steam' | 'epic'
  getInstalledGames(): Promise<InstalledGame[]>
  // Returns the protocol URL to open, rather than launching directly, so the
  // allow-list check (security/external-url.ts) stays centralized in the IPC
  // handler instead of being duplicated per store.
  getLaunchUrl(storeGameId: string): string
}
