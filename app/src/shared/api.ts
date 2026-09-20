import type {
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamOwnedGame
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
    getOwnedGames: () => Promise<SteamOwnedGame[]>
    // null when nothing is saved for the connected account yet.
    getCachedLibrary: () => Promise<SteamOwnedGame[] | null>
  }
}
