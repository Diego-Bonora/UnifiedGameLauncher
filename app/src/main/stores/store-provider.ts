// The shape every store folder under main/stores/ implements, so the IPC
// layer and (later) the library cache can treat stores interchangeably.
export interface InstalledGame {
  storeGameId: string
  title: string
  installPath: string
}

export interface StoreProvider {
  readonly store: 'steam' | 'epic'
  getInstalledGames(): Promise<InstalledGame[]>
  // Returns the protocol URL to open, rather than launching directly, so the
  // allow-list check (security/external-url.ts) stays centralized in the IPC
  // handler instead of being duplicated per store.
  getLaunchUrl(storeGameId: string): string
}
