import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  EpicClearCoverKeyResult,
  EpicCoverStatus,
  EpicInstalledGame,
  EpicSetCoverKeyResult
} from '@shared/ipc/epic-channels'
import { nextEpicGames } from './epic-view'

export interface EpicLibrary {
  // false until the first list read has answered (or failed).
  loaded: boolean
  games: EpicInstalledGame[]
  // null until the first read; the key form stays hidden until then.
  coverStatus: EpicCoverStatus | null
  // The first status read failed and none has worked since, so Settings can
  // offer a retry instead of "Checking..." forever (with no key saved, main
  // sends no notice that would re-read it).
  coverStatusFailed: boolean
  reloadCoverStatus: () => void
  // Changes on every successful list read. A cover that failed to load (a
  // file briefly locked by antivirus) gets another try then: Epic cover URLs
  // never change, so without this a failed image would stay a placeholder
  // all session.
  coverRetryToken: number
  reloadGames: () => void
  // A key save or removal is running. Held here, not in the form, so leaving
  // Settings mid-save and coming back can't start a second one.
  coverKeyBusy: boolean
  // 'busy' when another key action is still running; 'failed' when the call
  // itself broke. A new status is applied here before resolving.
  saveCoverKey: (apiKey: string) => Promise<EpicSetCoverKeyResult | 'busy' | 'failed'>
  clearCoverKey: () => Promise<EpicClearCoverKeyResult | 'busy' | 'failed'>
}

// Everything the app knows about Epic, held once for the whole app (not by a
// view), so switching views or opening Settings never drops or re-reads it.
export function useEpicLibrary(): EpicLibrary {
  const [loaded, setLoaded] = useState(false)
  const [games, setGames] = useState<EpicInstalledGame[]>([])
  const [coverStatus, setCoverStatus] = useState<EpicCoverStatus | null>(null)
  const [coverStatusFailed, setCoverStatusFailed] = useState(false)
  const [coverKeyBusy, setCoverKeyBusy] = useState(false)
  // State lags a render; a second click must see the first one at once.
  const coverKeyBusyRef = useRef(false)
  const [coverRetryToken, setCoverRetryToken] = useState(0)
  // Only the newest read may update the list: focus can fire a new one while
  // an older one is still running.
  const latestReadRef = useRef(0)
  const latestStatusReadRef = useRef(0)

  const reloadGames = useCallback(() => {
    const read = ++latestReadRef.current
    const apply = (result: EpicInstalledGame[] | 'failed'): void => {
      if (read !== latestReadRef.current) return
      setGames((previous) => nextEpicGames(previous, result))
      setLoaded(true)
      if (result !== 'failed') setCoverRetryToken((token) => token + 1)
    }
    window.api.epic
      .getInstalledGames()
      .then(apply)
      // Detection failing is never shown raw: the first read reads as
      // "nothing found", and a later refresh keeps what was already there.
      .catch(() => apply('failed'))
  }, [])

  const loadCoverStatus = useCallback(() => {
    const read = ++latestStatusReadRef.current
    window.api.epic
      .getCoverStatus()
      .then((status) => {
        if (read !== latestStatusReadRef.current) return
        setCoverStatus(status)
        setCoverStatusFailed(false)
      })
      // Keep whatever was shown; the next focus or notice reads it again.
      // Only "failed" if there is nothing to show at all.
      .catch(() => {
        if (read === latestStatusReadRef.current) setCoverStatusFailed(true)
      })
  }, [])

  // Bumping the read counter makes an older status read still in flight lose.
  const applyCoverStatus = useCallback((status: EpicCoverStatus) => {
    latestStatusReadRef.current++
    setCoverStatus(status)
    setCoverStatusFailed(false)
  }, [])

  const runCoverKeyAction = useCallback(
    async <T extends { status: EpicCoverStatus } | { saved: false }>(
      action: () => Promise<T>
    ): Promise<T | 'busy' | 'failed'> => {
      if (coverKeyBusyRef.current) return 'busy'
      coverKeyBusyRef.current = true
      setCoverKeyBusy(true)
      try {
        const result = await action()
        if ('status' in result) applyCoverStatus(result.status)
        return result
      } catch {
        return 'failed'
      } finally {
        coverKeyBusyRef.current = false
        setCoverKeyBusy(false)
      }
    },
    [applyCoverStatus]
  )

  const saveCoverKey = useCallback(
    (apiKey: string) => runCoverKeyAction(() => window.api.epic.setCoverKey(apiKey)),
    [runCoverKeyAction]
  )
  const clearCoverKey = useCallback(
    () => runCoverKeyAction(() => window.api.epic.clearCoverKey()),
    [runCoverKeyAction]
  )

  // Main says new covers are on disk or the cover status changed: re-read
  // both. Covers arrive in the background after a key is saved or a game is
  // installed, so this is how tiles change from placeholder to poster.
  useEffect(
    () =>
      window.api.epic.onCoversChanged(() => {
        reloadGames()
        loadCoverStatus()
      }),
    [reloadGames, loadCoverStatus]
  )

  useEffect(() => {
    reloadGames()
    loadCoverStatus()
    // A game installed or removed in Epic's launcher shows up when the user
    // comes back to this window. The read is a handful of small files.
    const handleFocus = (): void => {
      reloadGames()
      // Also the retry for a status read that failed: with no key saved, main
      // never sends a notice, so focus is the only other chance.
      loadCoverStatus()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [reloadGames, loadCoverStatus])

  return {
    loaded,
    games,
    coverStatus,
    coverStatusFailed,
    reloadCoverStatus: loadCoverStatus,
    coverRetryToken,
    reloadGames,
    coverKeyBusy,
    saveCoverKey,
    clearCoverKey
  }
}
