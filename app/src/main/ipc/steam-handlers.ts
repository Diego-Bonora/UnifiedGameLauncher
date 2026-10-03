import {
  steamAppRequestSchema,
  steamInstalledGameSchema,
  type SteamHandOffResult,
  type SteamInstalledResult
} from '@shared/ipc/steam'
import type { StoreProvider } from '../stores/store-provider'
import type { SteamInstallScan } from '../stores/steam'
import { isAllowedExternalUrl } from '../security/external-url'

// The logic behind the Steam launch, install and installed-games channels,
// kept free of any Electron import so it can be tested directly; ipc/steam.ts
// only wires it to ipcMain and shell.

// What the renderer is told when the scan itself broke: nothing seen, and
// nothing known about which libraries exist, so it keeps everything it showed.
const NOTHING_SEEN: SteamInstalledResult = {
  games: [],
  unreadableLibraries: [],
  libraryListReadable: false
}

// One spelling per library folder, so a folder matches itself from one read
// to the next. Windows paths ignore case and accept either slash, and Steam
// doesn't spell the same folder the same way everywhere (the registry's
// SteamPath vs. libraryfolders.vdf). Only used for comparing: installPath
// keeps its real spelling.
export function libraryKey(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

// Never rejects: a rejected IPC call would reach the renderer as Electron's
// prefixed raw error.
export async function listSteamInstalledGames(
  scan: () => Promise<SteamInstallScan>
): Promise<SteamInstalledResult> {
  let result: SteamInstallScan
  try {
    result = await scan()
  } catch (err) {
    console.warn('[steam] could not detect installed games:', err)
    return NOTHING_SEEN
  }
  // A malformed entry is dropped rather than failing the whole list, matching
  // the parser's rule that one bad file must not hide every other game.
  const games = result.libraries.flatMap((library) =>
    library.games.flatMap((game) => {
      const parsed = steamInstalledGameSchema.safeParse({
        appId: game.storeGameId,
        title: game.title,
        installPath: game.installPath,
        libraryPath: libraryKey(library.path)
      })
      if (!parsed.success) {
        console.warn('[steam] dropped a malformed installed game:', parsed.error.message)
        return []
      }
      return [parsed.data]
    })
  )
  return {
    games,
    unreadableLibraries: result.libraries
      .filter((library) => !library.readable)
      .map((library) => libraryKey(library.path)),
    libraryListReadable: result.libraryListReadable
  }
}

export type SteamHandOff = 'launch' | 'install'

// Throws for a malformed payload or a URL outside the allow-list (caller or
// code bugs). Steam not taking the URL is an expected outcome, returned as
// data. Unlike Epic's launch, this doesn't first check the game is installed:
// Steam itself handles a launch for a game that isn't (it offers the install).
export async function handOffToSteam(
  kind: SteamHandOff,
  provider: StoreProvider,
  rawRequest: unknown,
  openExternal: (url: string) => Promise<void>
): Promise<SteamHandOffResult> {
  const { appId } = steamAppRequestSchema.parse(rawRequest)
  const buildUrl = kind === 'launch' ? provider.getLaunchUrl : provider.getInstallUrl
  if (buildUrl === undefined) throw new Error(`The ${provider.store} store can't install games.`)
  const url = buildUrl.call(provider, appId)
  // Defensive: keeps the allow-list the single source of truth if the URL
  // builder ever changes.
  if (!isAllowedExternalUrl(url)) throw new Error('This game cannot be opened right now.')
  try {
    await openExternal(url)
  } catch (err) {
    // Windows has no handler for steam:// (Steam uninstalled, or its
    // registration is broken). Logged here; the renderer words it.
    console.warn(`[steam] could not hand the ${kind} request to Steam:`, err)
    return { accepted: false, reason: 'steamUnavailable' }
  }
  return { accepted: true }
}
