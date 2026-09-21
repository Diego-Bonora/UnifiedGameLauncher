import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_NAME } from '@shared/app-info'
import type {
  SteamCachedLibrary,
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamLibraryProblem,
  SteamOwnedGame
} from '@shared/ipc/steam-channels'
import EpicInstalledSection from './EpicInstalledSection'
import GameCoverArt from './GameCoverArt'
import { libraryNotice, ONLINE_DEBOUNCE_MS, retryDelayMs } from './library-problems'
import { mergeFreshCovers } from './library-view'

type LoadState = 'loading' | 'loaded'

// Tagged with the steamId64 it was fetched for, so a render can tell a
// finished result apart from one that belongs to a PREVIOUS account (after
// reconnecting as someone else) purely by comparison — no explicit "reset to
// null" setState call needed in the effect below, which would otherwise run
// synchronously in the effect body and trip react-hooks/set-state-in-effect
// (see the getInstalledGames effect above for the same reasoning).
// `games` and `error` are independent: a failed refresh keeps the last good
// list for that account (games set, error set) instead of discarding it.
// `problem` is different from `error`: it is main's own report of why the
// refresh failed (offline, key turned down, ...), with or without a saved copy
// to show; `error` is only for the unexpected case where the call itself broke.
// `failures` counts refreshes in a row that failed, for the retry backoff.
interface OwnedGamesResult {
  steamId64: string
  games: SteamOwnedGame[] | null
  error: string | null
  problem: SteamLibraryProblem | null
  failures: number
}

function App(): React.JSX.Element {
  const [state, setState] = useState<LoadState>('loading')
  const [games, setGames] = useState<SteamInstalledGame[]>([])
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [connection, setConnection] = useState<SteamConnectionStatus | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [ownedGamesResult, setOwnedGamesResult] = useState<OwnedGamesResult | null>(null)
  const [cachedLibrary, setCachedLibrary] = useState<SteamCachedLibrary | null>(null)
  // Bumped to re-run the live fetch below: by the online event, the retry
  // timer, the "Try again" button, or a changed API key. These are only
  // triggers: whether we are really offline is decided by the fetch itself
  // failing, never by the browser's online flag.
  const [refreshTick, setRefreshTick] = useState(0)
  const requestRefresh = useCallback(() => setRefreshTick((tick) => tick + 1), [])
  // True while a live fetch is running, so the retry timer doesn't start a
  // second one on top of it.
  const refreshingRef = useRef(false)

  const handleLaunch = (appId: string): void => {
    setLaunchError(null)
    window.api.steam.launch(appId).catch(() => {
      setLaunchError('Could not launch this game. Make sure Steam is installed and running.')
    })
  }

  const handleConnect = (): void => {
    setConnectError(null)
    setConnecting(true)
    window.api.steam
      .signIn()
      .then(setConnection)
      .catch(() => {
        setConnectError('Could not connect to Steam. Please try again.')
      })
      .finally(() => setConnecting(false))
  }

  const handleCancelConnect = (): void => {
    void window.api.steam.cancelSignIn()
  }

  const handleSaveApiKey = (event: React.FormEvent): void => {
    event.preventDefault()
    // The submit button disables while saving, but pressing Enter in the
    // input re-fires this handler directly — guard here too, or a save
    // already in flight and this new one can resolve out of order.
    if (savingApiKey) return
    setApiKeyError(null)
    setSavingApiKey(true)
    window.api.steam
      .setApiKey(apiKeyInput)
      .then((status) => {
        setConnection(status)
        setApiKeyInput('')
        // A new key deserves a fresh attempt now, and must not sit under the
        // previous key's "turned down" notice while it loads. Neither changes
        // the effect's other dependencies when the key is merely replaced.
        setOwnedGamesResult(null)
        requestRefresh()
      })
      .catch((err: unknown) => {
        // The main-process handler already produces a friendly message for
        // both a malformed key and an encryption failure; surface it as-is
        // rather than a second, generic one.
        setApiKeyError(err instanceof Error ? err.message : 'Could not save the API key.')
      })
      .finally(() => setSavingApiKey(false))
  }

  const handleClearApiKey = (): void => {
    window.api.steam
      .clearApiKey()
      .then((status) => {
        setConnection(status)
        // Otherwise the old result (and its notice) reappears if a key is
        // added again before the next fetch lands.
        setOwnedGamesResult(null)
      })
      .catch(() => {
        setApiKeyError('Could not remove the saved API key.')
      })
  }

  useEffect(() => {
    window.api.steam
      .getInstalledGames()
      .then((installedGames) => {
        setGames(installedGames)
        setState('loaded')
      })
      .catch(() => {
        // A friendly empty state beats a raw error — detection failing
        // quietly is the same as "no games found" from the user's view.
        setGames([])
        setState('loaded')
      })

    window.api.steam
      .getConnectionStatus()
      .then(setConnection)
      .catch(() => setConnection(null))
  }, [])

  // Keyed on steamId64 too, not just status/hasApiKey: reconnecting as a
  // DIFFERENT Steam account changes neither of those, but must still
  // trigger a fresh fetch instead of leaving the previous account's list
  // on screen under the new account's identity.
  useEffect(() => {
    if (connection?.status !== 'connected' || !connection.hasApiKey) {
      refreshingRef.current = false
      return
    }
    const steamId64 = connection.steamId64
    // Guards against two overlapping fetches (e.g. the user toggles the API
    // key or reconnects twice in quick succession) resolving out of order —
    // the cleanup below marks THIS run's promise stale before a newer run's
    // effect body starts, so only the latest one is ever allowed to setState.
    let ignore = false
    refreshingRef.current = true
    window.api.steam
      .getOwnedGames()
      .then((result) => {
        if (ignore) return
        setOwnedGamesResult((previous) => {
          // Only carry state over from the SAME account — never another
          // account's games or failure count across a reconnect.
          const kept = previous !== null && previous.steamId64 === steamId64 ? previous : null
          return {
            steamId64,
            // A 'none' result carries no games: keep what this account showed.
            games: result.games ?? kept?.games ?? null,
            error: null,
            problem: result.problem,
            failures: result.problem === null ? 0 : (kept?.failures ?? 0) + 1
          }
        })
      })
      .catch((err: unknown) => {
        if (ignore) return
        const error = err instanceof Error ? err.message : 'Could not load your Steam library.'
        setOwnedGamesResult((previous) => {
          const kept = previous !== null && previous.steamId64 === steamId64 ? previous : null
          return {
            steamId64,
            games: kept?.games ?? null,
            error,
            problem: null,
            failures: (kept?.failures ?? 0) + 1
          }
        })
      })
      .finally(() => {
        // Only the latest run may say "no longer refreshing"; a superseded
        // one finishing late must not clear its successor's flag.
        if (!ignore) refreshingRef.current = false
      })
    return () => {
      ignore = true
    }
  }, [connection?.status, connection?.hasApiKey, connection?.steamId64, refreshTick])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const handleOnline = (): void => {
      clearTimeout(timer)
      timer = setTimeout(requestRefresh, ONLINE_DEBOUNCE_MS)
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      clearTimeout(timer)
    }
  }, [requestRefresh])

  // New covers finished downloading. Until now the grid was showing the remote
  // URLs; re-read the library (main now returns local URLs for what is on
  // disk) and swap just the cover URLs in, so the local copies are used this
  // session instead of only after a restart.
  useEffect(() => {
    return window.api.steam.onCoversChanged(() => {
      window.api.steam
        .getCachedLibrary()
        .then((cached) => {
          if (cached === null) return
          setCachedLibrary(cached)
          setOwnedGamesResult((previous) => mergeFreshCovers(previous, cached))
        })
        .catch(() => {
          // Covers are a nicety; the remote URLs keep working.
        })
    })
  }, [])

  // Saved copy of the library, shown instantly while the live fetch above is
  // still running. Same steamId64 tagging and `ignore` guard as that effect.
  useEffect(() => {
    if (connection?.status !== 'connected' || !connection.hasApiKey) return
    let ignore = false
    window.api.steam
      .getCachedLibrary()
      .then((cached) => {
        // The account tag comes from main, not from this effect's closure.
        if (!ignore && cached !== null) setCachedLibrary(cached)
      })
      .catch(() => {
        // No saved copy is not an error; the live fetch is still coming.
      })
    return () => {
      ignore = true
    }
  }, [connection?.status, connection?.hasApiKey, connection?.steamId64])

  const currentSteamId64 = connection?.status === 'connected' ? connection.steamId64 : null
  // A result tagged for a DIFFERENT (e.g. previous) account is treated as
  // "not here yet" rather than shown — this is what makes reconnecting as
  // someone else fall back to a loading state instead of a stale list.
  const ownedGamesForCurrentAccount =
    ownedGamesResult !== null && ownedGamesResult.steamId64 === currentSteamId64
      ? ownedGamesResult
      : null
  const showOwnedGames = connection?.status === 'connected' && connection.hasApiKey === true
  const ownedGamesError = ownedGamesForCurrentAccount?.error ?? null
  const libraryProblem = ownedGamesForCurrentAccount?.problem ?? null
  const cachedGames =
    cachedLibrary !== null && cachedLibrary.steamId64 === currentSteamId64
      ? cachedLibrary.games
      : null
  // Live result wins; the saved copy fills the gap until it arrives, and
  // stays on screen if the live fetch fails.
  const ownedGames = ownedGamesForCurrentAccount?.games ?? cachedGames
  const loadingOwnedGames =
    showOwnedGames && ownedGames === null && ownedGamesError === null && libraryProblem === null
  const notice = libraryProblem !== null ? libraryNotice(libraryProblem, ownedGames !== null) : null
  const needsRetry = showOwnedGames && (libraryProblem !== null || ownedGamesError !== null)
  const failures = ownedGamesForCurrentAccount?.failures ?? 0

  // While a problem is showing, keep trying on our own: the browser's online
  // event is unreliable (it can fire before the connection works, or never).
  // Keyed on the failure count, not on the result object: every failed refresh
  // bumps it (so the timer is rescheduled with the next delay), while a cover
  // swap replaces the object without being a new attempt and must not reset
  // the backoff.
  useEffect(() => {
    if (!needsRetry) return
    const timer = setTimeout(() => {
      // A fetch already running will report back on its own.
      if (!refreshingRef.current) requestRefresh()
    }, retryDelayMs(failures))
    return () => clearTimeout(timer)
  }, [needsRetry, failures, requestRefresh])

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>

      <section className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
        <span className="text-muted">
          {connecting
            ? 'Waiting for you to finish signing in in your browser…'
            : connection?.status === 'connected'
              ? `Connected as Steam ID ${connection.steamId64}`
              : 'Not connected to Steam'}
        </span>
        {connecting ? (
          <button
            type="button"
            onClick={handleCancelConnect}
            className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover"
          >
            {connection?.status === 'connected' ? 'Reconnect Steam' : 'Connect Steam'}
          </button>
        )}
      </section>
      {connectError !== null && <p className="text-danger">{connectError}</p>}

      <section className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3">
        <span className="text-muted">
          {connection?.hasApiKey === true
            ? 'Steam Web API key saved.'
            : 'No Steam Web API key saved yet — needed to show your owned games.'}
        </span>
        <form onSubmit={handleSaveApiKey} className="flex items-center gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Paste your Steam Web API key"
            disabled={savingApiKey}
            className="flex-1 rounded-control border border-border bg-surface-2 px-3 py-1 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={savingApiKey || apiKeyInput.trim() === ''}
            className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          {connection?.hasApiKey === true && (
            <button
              type="button"
              onClick={handleClearApiKey}
              className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Remove
            </button>
          )}
        </form>
        <span className="text-xs text-muted">
          Get a free key at steamcommunity.com/dev/apikey — it&apos;s tied to your account, never
          shared with anyone else.
        </span>
        {apiKeyError !== null && <p className="text-danger">{apiKeyError}</p>}
      </section>

      {showOwnedGames && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Your Steam Library</h2>
          {needsRetry && (
            <div className="flex flex-wrap items-center gap-3">
              {notice?.tone === 'pill' && (
                <p
                  role="status"
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted"
                >
                  <span className="h-2 w-2 rounded-full bg-muted" aria-hidden="true" />
                  {notice.text}
                </p>
              )}
              {notice !== null && notice.tone !== 'pill' && (
                <p className={notice.tone === 'danger' ? 'text-danger' : 'text-sm text-muted'}>
                  {notice.text}
                </p>
              )}
              {ownedGamesError !== null && <p className="text-danger">{ownedGamesError}</p>}
              {ownedGamesError !== null && ownedGames !== null && (
                <p className="text-sm text-muted">Showing your last saved library.</p>
              )}
              <button
                type="button"
                onClick={requestRefresh}
                className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                Try again
              </button>
            </div>
          )}
          {loadingOwnedGames && (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <div key={key} className="aspect-[2/3] animate-pulse rounded-card bg-surface-2" />
              ))}
            </div>
          )}
          {!loadingOwnedGames && ownedGames !== null && ownedGames.length === 0 && (
            <p className="text-muted">
              No games found. Your Steam library might be empty, or your profile&apos;s game details
              might be set to private.
            </p>
          )}
          {!loadingOwnedGames && ownedGames !== null && ownedGames.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
              {ownedGames.map((game) => (
                <li key={game.appId} className="flex min-w-0 flex-col gap-2">
                  <GameCoverArt coverUrl={game.coverUrl} />
                  <span className="truncate text-sm text-muted">{game.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {launchError !== null && <p className="text-danger">{launchError}</p>}

      {state === 'loading' && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-14 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}

      {state === 'loaded' && games.length === 0 && (
        <p className="text-muted">No installed Steam games found on this PC.</p>
      )}

      {state === 'loaded' && games.length > 0 && (
        <ul className="flex flex-col gap-2">
          {games.map((game) => (
            <li
              key={game.appId}
              className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3"
            >
              <span>{game.title}</span>
              <button
                type="button"
                onClick={() => handleLaunch(game.appId)}
                className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover"
              >
                Play
              </button>
            </li>
          ))}
        </ul>
      )}

      <EpicInstalledSection />
    </main>
  )
}

export default App
