import { ZodError } from 'zod'
import {
  epicInstalledGameSchema,
  epicLaunchRequestSchema,
  type EpicInstalledGame,
  type EpicLaunchResult
} from '@shared/ipc/epic'
import type { InstalledGame, StoreProvider } from '../stores/store-provider'
import { isAllowedExternalUrl } from '../security/external-url'

// The logic behind the Epic IPC channels, kept free of any Electron import so
// it can be tested directly; ipc/epic.ts only wires it to ipcMain and shell.

export async function listEpicInstalledGames(
  provider: StoreProvider
): Promise<EpicInstalledGame[]> {
  let games: InstalledGame[]
  try {
    games = await provider.getInstalledGames()
  } catch (err) {
    // A rejected IPC call would reach the renderer as Electron's prefixed
    // raw error, so an unexpected failure shows as "nothing detected".
    console.warn('[epic] could not detect installed games:', err)
    return []
  }
  // A malformed entry is dropped rather than failing the whole list, matching
  // the parser's rule that one bad file must not hide every other game.
  return games.flatMap((game) => {
    const result = epicInstalledGameSchema.safeParse({
      appName: game.storeGameId,
      title: game.title,
      installPath: game.installPath
    })
    if (!result.success) {
      console.warn('[epic] dropped a malformed installed game:', result.error.message)
      return []
    }
    return [result.data]
  })
}

export type EpicLaunchPlan = { url: string } | { notInstalled: true }

// Throws for a malformed payload (a caller bug). A well-formed request for a
// game that isn't installed is an expected outcome and comes back as data.
export async function planEpicLaunch(
  provider: StoreProvider,
  rawRequest: unknown
): Promise<EpicLaunchPlan> {
  const { appName } = epicLaunchRequestSchema.parse(rawRequest)

  // The renderer may only launch what was actually detected on this PC, not
  // any id it can spell, even though the URL scheme itself is allow-listed.
  const installed = await provider.getInstalledGames()
  const game = installed.find((candidate) => candidate.storeGameId === appName)
  if (game === undefined) return { notInstalled: true }

  const url = provider.getLaunchUrl(game.storeGameId)
  // Defensive: keeps the allow-list the single source of truth if the URL
  // builder ever changes. Throwing means a launch that didn't happen is never
  // reported as success.
  if (!isAllowedExternalUrl(url)) throw new Error('This game cannot be launched right now.')
  return { url }
}

export async function launchEpicGame(
  provider: StoreProvider,
  rawRequest: unknown,
  openExternal: (url: string) => Promise<void>
): Promise<EpicLaunchResult> {
  let plan: EpicLaunchPlan
  try {
    plan = await planEpicLaunch(provider, rawRequest)
  } catch (err) {
    // A bad payload is a caller bug and should surface, but detection itself
    // failing is not the caller's fault. Launching a game we couldn't confirm
    // is installed would be wrong, so it reads as "not installed" (returned
    // as data, not Electron's prefixed raw error).
    if (err instanceof ZodError) throw err
    console.warn('[epic] could not confirm the game is installed:', err)
    return { launched: false, reason: 'notInstalled' }
  }
  if ('notInstalled' in plan) return { launched: false, reason: 'notInstalled' }
  try {
    await openExternal(plan.url)
  } catch (err) {
    // Windows has no handler for the protocol (launcher uninstalled, or its
    // registration is broken). Returned as data so the user gets a friendly
    // message instead of Electron's prefixed raw error.
    console.warn('[epic] could not hand the launch request to the Epic launcher:', err)
    return { launched: false, reason: 'launcherUnavailable' }
  }
  return { launched: true }
}
