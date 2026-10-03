import { useCallback, useEffect, useRef, useState } from 'react'
import type { EpicCoverStatus, EpicInstalledGame } from '@shared/ipc/epic-channels'
import { nextEpicGames } from './epic-view'

export interface EpicLibrary {
  // false until the first list read has answered (or failed).
  loaded: boolean
  games: EpicInstalledGame[]
  // null until the first read; the key form stays hidden until then.
  coverStatus: EpicCoverStatus | null
  // Changes on every successful list read. A cover that failed to load (a
  // file briefly locked by antivirus) gets another try then: Epic cover URLs
  // never change, so without this a failed image would stay a placeholder
  // all session.
  coverRetryToken: number
  reloadGames: () => void
  // A key save or removal answers with the new status directly.
  applyCoverStatus: (status: EpicCoverStatus) => void
}

// Everything the app knows about Epic, held once for the whole app (not by a
// view), so switching views or opening Settings never drops or re-reads it.
export function useEpicLibrary(): EpicLibrary {
  const [loaded, setLoaded] = useState(false)
  const [games, setGames] = useState<EpicInstalledGame[]>([])
  const [coverStatus, setCoverStatus] = useState<EpicCoverStatus | null>(null)
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
        if (read === latestStatusReadRef.current) setCoverStatus(status)
      })
      // Keep whatever was shown; the next focus or notice reads it again.
      .catch(() => undefined)
  }, [])

  // Bumping the read counter makes an older status read still in flight lose.
  const applyCoverStatus = useCallback((status: EpicCoverStatus) => {
    latestStatusReadRef.current++
    setCoverStatus(status)
  }, [])

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

  return { loaded, games, coverStatus, coverRetryToken, reloadGames, applyCoverStatus }
}
