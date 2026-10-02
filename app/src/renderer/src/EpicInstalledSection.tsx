import { useCallback, useEffect, useRef, useState } from 'react'
import type { EpicCoverStatus, EpicInstalledGame } from '@shared/ipc/epic-channels'
import EpicCoverKeyForm from './EpicCoverKeyForm'
import EpicGameTile from './EpicGameTile'
import { feedbackForLaunch, nextEpicGames, type LaunchOutcome } from './epic-view'

type LoadState = 'loading' | 'loaded'

// How long the tiles stay paused after Epic accepts a launch. The hand-off
// returns almost at once, but the game window can take a while to appear, and
// a tile that looks idle again invites a second click and a second launch.
const LAUNCH_COOLDOWN_MS = 5000

interface Feedback {
  message: string
  tone: 'info' | 'danger'
}

// Owns everything about Epic in the window (list, launching, its own message
// line) so a problem here can never show up under Steam, and App.tsx doesn't
// grow further.
function EpicInstalledSection(): React.JSX.Element {
  const [state, setState] = useState<LoadState>('loading')
  const [games, setGames] = useState<EpicInstalledGame[]>([])
  const [launchingAppName, setLaunchingAppName] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  // null until the first read; the key form stays hidden until then.
  const [coverStatus, setCoverStatus] = useState<EpicCoverStatus | null>(null)
  // Changes on every successful list read. A cover that failed to load (a
  // file briefly locked by antivirus) gets another try then: Epic cover URLs
  // never change, so without this a failed image would stay a placeholder
  // all session.
  const [coverRetryToken, setCoverRetryToken] = useState(0)
  // Only the newest read may update the list: focus can fire a new one while
  // an older one is still running.
  const latestReadRef = useRef(0)
  const latestStatusReadRef = useRef(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadGames = useCallback(() => {
    const read = ++latestReadRef.current
    const apply = (result: EpicInstalledGame[] | 'failed'): void => {
      if (read !== latestReadRef.current) return
      setGames((previous) => nextEpicGames(previous, result))
      setState('loaded')
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

  // A key save or removal answers with the new status directly. Bumping the
  // read counter makes an older status read still in flight lose.
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
        loadGames()
        loadCoverStatus()
      }),
    [loadGames, loadCoverStatus]
  )

  useEffect(() => {
    loadGames()
    loadCoverStatus()
    // A game installed or removed in Epic's launcher shows up when the user
    // comes back to this window. The read is a handful of small files. Coming
    // back also clears an old problem message: it may no longer be true.
    const handleFocus = (): void => {
      setFeedback((current) => (current?.tone === 'danger' ? null : current))
      loadGames()
      // Also the retry for a status read that failed: with no key saved, main
      // never sends a notice, so focus is the only other chance.
      loadCoverStatus()
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      clearTimeout(cooldownTimerRef.current)
    }
  }, [loadGames, loadCoverStatus])

  const finishLaunch = (game: EpicInstalledGame, outcome: LaunchOutcome): void => {
    const result = feedbackForLaunch(game.title, outcome)
    setFeedback({ message: result.message, tone: result.tone })
    if (result.refreshList) loadGames()

    if (result.tone === 'danger') {
      // Nothing started, so the tiles are free again straight away.
      setLaunchingAppName(null)
      return
    }
    cooldownTimerRef.current = setTimeout(() => {
      setLaunchingAppName(null)
      // Only the progress line goes away on its own; a problem must stay.
      setFeedback((current) => (current?.tone === 'info' ? null : current))
    }, LAUNCH_COOLDOWN_MS)
  }

  const handlePlay = (game: EpicInstalledGame): void => {
    // The tiles are aria-disabled while a launch is running, which (unlike the
    // disabled attribute) keeps keyboard focus but doesn't block clicks.
    if (launchingAppName !== null) return
    setFeedback(null)
    setLaunchingAppName(game.appName)
    window.api.epic
      .launch(game.appName)
      .then((result) => finishLaunch(game, result))
      .catch(() => finishLaunch(game, 'failed'))
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">Epic Games</h2>
      {feedback?.tone === 'danger' && (
        <p role="alert" className="text-danger">
          {feedback.message}
        </p>
      )}
      {feedback?.tone === 'info' && (
        <p role="status" className="text-sm text-muted">
          {feedback.message}
        </p>
      )}
      {/* A key only matters with Epic games installed, or to remove one. */}
      {state === 'loaded' && coverStatus !== null && (games.length > 0 || coverStatus.hasKey) && (
        <EpicCoverKeyForm status={coverStatus} onStatusChange={applyCoverStatus} />
      )}
      {state === 'loading' && (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4"
          aria-busy="true"
        >
          {[0, 1, 2].map((key) => (
            <div key={key} className="aspect-[2/3] animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}
      {state === 'loaded' && games.length === 0 && (
        <p className="text-muted">No installed Epic games found on this PC.</p>
      )}
      {state === 'loaded' && games.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {games.map((game) => (
            <li key={game.appName} className="min-w-0">
              <EpicGameTile
                title={game.title}
                coverUrl={game.coverUrl}
                coverRetryToken={coverRetryToken}
                busy={launchingAppName !== null}
                launching={launchingAppName === game.appName}
                onPlay={() => handlePlay(game)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EpicInstalledSection
