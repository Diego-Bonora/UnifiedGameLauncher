import type {
  EpicClearCoverKeyResult,
  EpicCoverStatus,
  EpicInstalledGame,
  EpicLaunchResult,
  EpicSetCoverKeyResult
} from './ipc/epic-channels'
import type {
  SteamCachedLibrary,
  SteamConnectionStatus,
  SteamHandOffResult,
  SteamInstalledResult,
  SteamLibraryResult
} from './ipc/steam-channels'

// The complete surface the renderer may call. Each milestone adds named,
// typed functions here (backed by zod-validated IPC in main), never a
// generic "send any channel" escape hatch.
export interface RendererApi {
  steam: {
    // Resolves even when nothing could be read; says which library folders
    // it couldn't see.
    getInstalledGames: () => Promise<SteamInstalledResult>
    // Both resolve for every expected outcome, including Steam not taking the
    // request; reject only for a malformed appId.
    launch: (appId: string) => Promise<SteamHandOffResult>
    install: (appId: string) => Promise<SteamHandOffResult>
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
  epic: {
    getInstalledGames: () => Promise<EpicInstalledGame[]>
    // Resolves for every expected outcome, including `accepted: false` when
    // the game was uninstalled or the Epic launcher can't be reached; rejects
    // only for a malformed request.
    launch: (appName: string) => Promise<EpicLaunchResult>
    // SteamGridDB key for Epic covers. The key never comes back; only
    // whether one is saved and any problem with it.
    getCoverStatus: () => Promise<EpicCoverStatus>
    // Resolves for every expected outcome (saved, invalid key, can't store).
    setCoverKey: (apiKey: string) => Promise<EpicSetCoverKeyResult>
    clearCoverKey: () => Promise<EpicClearCoverKeyResult>
    // New covers are on disk or the cover status changed: re-read both.
    // Returns a function that stops listening.
    onCoversChanged: (callback: () => void) => () => void
  }
}
