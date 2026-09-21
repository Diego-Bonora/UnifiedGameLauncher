import type {
  SteamCachedLibrary,
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamLibraryResult
} from './ipc/steam-channels'

// The complete surface the renderer may call. Each milestone adds named,
// typed functions here (backed by zod-validated IPC in main), never a
// generic "send any channel" escape hatch.
export interface RendererApi {
  steam: {
    getInstalledGames: () => Promise<SteamInstalledGame[]>
    launch: (appId: string) => Promise<void>
    signIn: () => Promise<SteamConnectionStatus>
    cancelSignIn: () => Promise<void>
    disconnect: () => Promise<SteamConnectionStatus>
    getConnectionStatus: () => Promise<SteamConnectionStatus>
    setApiKey: (apiKey: string) => Promise<SteamConnectionStatus>
    clearApiKey: () => Promise<SteamConnectionStatus>
    // Resolves for every expected outcome (live, saved copy, or nothing to
    // show); rejects only if main is called in the wrong state.
    getOwnedGames: () => Promise<SteamLibraryResult>
    // null when nothing is saved for the connected account yet.
    getCachedLibrary: () => Promise<SteamCachedLibrary | null>
    // Called when new cover images have been saved to disk, so the window can
    // pick up the local copies. Returns a function that stops listening.
    onCoversChanged: (callback: () => void) => () => void
  }
}
