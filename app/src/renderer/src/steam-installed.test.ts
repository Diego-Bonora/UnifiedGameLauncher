import { describe, expect, it } from 'vitest'
import type { SteamInstalledGame, SteamInstalledResult } from '@shared/ipc/steam-channels'
import { nextSteamInstalled } from './steam-installed'

const game = (appId: string, libraryPath: string): SteamInstalledGame => ({
  appId,
  title: `Game ${appId}`,
  installPath: `${libraryPath}\\steamapps\\common\\${appId}`,
  libraryPath
})

const onC = game('10', 'c:\\steam')
const onD = game('20', 'd:\\lib')
const alsoOnD = game('30', 'd:\\lib')

const read = (
  games: SteamInstalledGame[],
  unreadableLibraries: string[] = [],
  libraryListReadable = true
): SteamInstalledResult => ({ games, unreadableLibraries, libraryListReadable })

describe('nextSteamInstalled', () => {
  it('shows the first read as it is, even with an unreadable folder', () => {
    expect(nextSteamInstalled(null, read([onC], ['d:\\lib']))).toEqual([onC])
  })

  it('takes a complete read as it is, dropping uninstalled games', () => {
    expect(nextSteamInstalled([onC, onD], read([onC]))).toEqual([onC])
  })

  it('keeps games last seen in a folder that could not be read', () => {
    expect(nextSteamInstalled([onC, onD, alsoOnD], read([onC], ['d:\\lib']))).toEqual([
      onC,
      onD,
      alsoOnD
    ])
  })

  it('still updates the folders that were read while another one sleeps', () => {
    const newOnC = game('40', 'c:\\steam')
    // onC was uninstalled, newOnC installed, D: asleep.
    expect(nextSteamInstalled([onC, onD], read([newOnC], ['d:\\lib']))).toEqual([newOnC, onD])
  })

  it('keeps every game last seen when the folder list itself was unreadable', () => {
    expect(nextSteamInstalled([onC, onD], read([], [], false))).toEqual([onC, onD])
  })

  it('does not list a game twice when it shows up again', () => {
    expect(nextSteamInstalled([onC, onD], read([onD], ['d:\\lib']))).toEqual([onD])
  })

  it('keeps the list when the call itself failed, and shows nothing on a failed first read', () => {
    expect(nextSteamInstalled([onC], 'failed')).toEqual([onC])
    expect(nextSteamInstalled(null, 'failed')).toEqual([])
  })
})
