import type { CopyProjectLinkResult } from './ipc/app-channels'
import type {
  EpicClearCoverKeyResult,
  EpicCoverStatus,
  EpicInstalledGame,
  EpicLaunchResult,
  EpicSetCoverKeyResult
} from './ipc/epic-channels'
import type { FavoriteSetResult } from './ipc/favorites-channels'
import type {
  ManualChangeResult,
  ManualCoverSource,
  ManualGamesList,
  ManualLaunchResult,
  ManualPickResult
} from './ipc/manual-channels'
import type {
  SteamCachedLibrary,
  SteamConnectionStatus,
  SteamHandOffResult,
  SteamInstalledResult,
  SteamLibraryResult,
  SteamSetApiKeyResult,
  SteamConnectResult,
  SteamDisconnectResult
} from './ipc/steam-channels'
import type {
  UpdateActionResult,
  UpdateSetEnabledResult,
  UpdateStatus
} from './ipc/updates-channels'
import type { StoreId } from './stores'

// The complete surface the renderer may call. Each milestone adds named,
// typed functions here (backed by zod-validated IPC in main), never a
// generic "send any channel" escape hatch.
export interface RendererApi {
  // About in Settings (docs/features/release.md, section 1).
  app: {
    getVersion: () => Promise<string>
    // Main copies its own constant; there is nothing to pass.
    copyProjectLink: () => Promise<CopyProjectLinkResult>
  }
  steam: {
    // Resolves even when nothing could be read; says which library folders
    // it couldn't see.
    getInstalledGames: () => Promise<SteamInstalledResult>
    // Both resolve for every expected outcome, including Steam not taking the
    // request; reject only for a malformed appId.
    launch: (appId: string) => Promise<SteamHandOffResult>
    install: (appId: string) => Promise<SteamHandOffResult>
    signIn: () => Promise<SteamConnectResult>
    cancelSignIn: () => Promise<void>
    disconnect: () => Promise<SteamDisconnectResult>
    getConnectionStatus: () => Promise<SteamConnectionStatus>
    setApiKey: (apiKey: string) => Promise<SteamSetApiKeyResult>
    clearApiKey: () => Promise<SteamConnectionStatus>
    // Resolves for every expected outcome (live, saved copy, or nothing to
    // show); rejects only if main is called in the wrong state (a caller
    // bug), so its message is never shown.
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
  // Games added by picking an .exe (docs/features/library-tools.md). Every
  // call resolves for expected outcomes (as data) and rejects only for a
  // malformed request. No call takes or returns an exe path.
  manual: {
    list: () => Promise<ManualGamesList>
    // Opens main's file dialog; main keeps the pick for add or cancelAdd.
    pickExe: () => Promise<ManualPickResult>
    // Non-empty arguments are saved only after main's own confirmation.
    add: (title: string, args: string) => Promise<ManualChangeResult>
    cancelAdd: () => Promise<void>
    rename: (id: string, title: string) => Promise<ManualChangeResult>
    setArgs: (id: string, args: string) => Promise<ManualChangeResult>
    // Opens main's file dialog for the new .exe.
    changeExe: (id: string) => Promise<ManualChangeResult>
    remove: (id: string) => Promise<ManualChangeResult>
    launch: (id: string) => Promise<ManualLaunchResult>
    // Steam cover or Exe icon; main looks for the poster in the background
    // and says so through onCoversChanged.
    setCoverSource: (id: string, source: ManualCoverSource) => Promise<ManualChangeResult>
    // A poster or icon was saved or removed: read the list again. Returns a
    // function that stops listening.
    onCoversChanged: (callback: () => void) => () => void
  }
  // Starred games, as `<store>:<id>` keys (docs/features/library-tools.md).
  favorites: {
    // Never rejects; an unreadable file reads as the last list main read.
    list: () => Promise<string[]>
    // Resolves for every expected outcome, with what main really has saved;
    // rejects only for a malformed request.
    set: (store: StoreId, id: string, favorite: boolean) => Promise<FavoriteSetResult>
  }
  updates: {
    getStatus: () => Promise<UpdateStatus>
    checkNow: () => Promise<UpdateActionResult>
    download: () => Promise<UpdateActionResult>
    restartAndInstall: () => Promise<UpdateActionResult>
    setEnabled: (enabled: boolean) => Promise<UpdateSetEnabledResult>
    onStatusChanged: (callback: () => void) => () => void
  }
}
