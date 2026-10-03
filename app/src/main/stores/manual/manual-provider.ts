import type { DirectStoreProvider, InstalledGame } from '../store-provider'
import type { ManualGamesFile } from './manual-games-file'
import { launchExe, realLaunchDeps, type LaunchDeps } from './manual-launch'

// Manual games as a store: listed from manual-games.json, started directly.
export function createManualProvider(
  file: ManualGamesFile,
  launchDeps: LaunchDeps = realLaunchDeps
): DirectStoreProvider {
  return {
    store: 'manual',
    launchesBy: 'direct',
    async getInstalledGames(): Promise<InstalledGame[]> {
      const read = await file.read()
      // Rejects rather than reading as "no games" (see DirectStoreProvider).
      if (!read.readable) throw new Error('manual-games.json could not be read')
      return read.games.map((game) => ({
        storeGameId: game.id,
        title: game.title,
        installPath: game.exePath
      }))
    },
    async launch(id) {
      const read = await file.read()
      // Can't look the game up, so nothing can be run.
      if (!read.readable) return { accepted: false, reason: 'unreadable' }
      const game = read.games.find((saved) => saved.id === id)
      if (game === undefined) return { accepted: false, reason: 'notFound' }
      return launchExe(game.exePath, game.args, launchDeps)
    }
  }
}
