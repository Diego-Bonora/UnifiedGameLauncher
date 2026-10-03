import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  SteamCachedLibrary,
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamInstalledResult,
  SteamLibraryProblem,
  SteamOwnedGame
} from '@shared/ipc/steam-channels'
import {
  libraryNotice,
  ONLINE_DEBOUNCE_MS,
  retryDelayMs,
  type LibraryNotice
} from './library-problems'
import { mergeFreshCovers } from './library-view'
import { nextSteamInstalled } from './steam-installed'

// Tagged with the steamId64 it was fetched for, so a render can tell a
// finished result apart from one that belongs to a PREVIOUS account (after
// reconnecting as someone else) purely by comparison — no explicit "reset to
// null" setState call needed in the effect below, which would otherwise run
// synchronously in the effect body and trip react-hooks/set-state-in-effect.
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

export interface SteamLibrary {
  // Installed on this PC. `installedLoaded` is false until the first read.
  installed: SteamInstalledGame[]
  installedLoaded: boolean
  // Changes whenever main says new covers were saved. A Steam cover that
  // failed to load once gets another try then: a local URL never changes, so
  // a cover saved again under the same URL would otherwise stay a
  // placeholder all session (see GameCoverArt).
  coverRetryToken: number

  connection: SteamConnectionStatus | null
  // false until the first connection read has answered, so a view can tell
  // "not connected" apart from "don't know yet" (and not flash a "Connect
  // Steam" prompt at every start for users who are connected).
  connectionLoaded: boolean
  connecting: boolean
  connectError: string | null
  connect: () => void
  cancelConnect: () => void

  savingApiKey: boolean
  apiKeyError: string | null
  // Resolves true when the key was saved, so the form can clear its input.
  saveApiKey: (apiKey: string) => Promise<boolean>
  clearApiKey: () => void

  // Connected with a key, so there is an owned library to show (or load).
  showOwned: boolean
  // Live result, else the saved copy; null while neither is here.
  owned: SteamOwnedGame[] | null
  loadingOwned: boolean
  notice: LibraryNotice | null
  ownedError: string | null
  needsRetry: boolean
  refreshOwned: () => void
}

// Everything the app knows about Steam, held once for the whole app (not by a
// view), so the owned library's retries, the online and covers listeners and
// the installed list keep running while another view or Settings is open.
export function useSteamLibrary(): SteamLibrary {
  const [installed, setInstalled] = useState<SteamInstalledGame[]>([])
  const [installedLoaded, setInstalledLoaded] = useState(false)
  const [coverRetryToken, setCoverRetryToken] = useState(0)
  const [connection, setConnection] = useState<SteamConnectionStatus | null>(null)
  const [connectionLoaded, setConnectionLoaded] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [ownedGamesResult, setOwnedGamesResult] = useState<OwnedGamesResult | null>(null)
  const [cachedLibrary, setCachedLibrary] = useState<SteamCachedLibrary | null>(null)
  // Bumped to re-run the live fetch below: by the online event, the retry
  // timer, the "Try again" button, or a changed API key. These are only
  // triggers: whether we are really offline is decided by the fetch itself
  // failing, never by the browser's online flag.
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshOwned = useCallback(() => setRefreshTick((tick) => tick + 1), [])
  // True while a live fetch is running, so the retry timer doesn't start a
  // second one on top of it.
  const refreshingRef = useRef(false)
  // Only the newest installed read may update the list: focus can fire a new
  // one while an older one is still running.
  const latestInstalledReadRef = useRef(0)
  // The save button disables while saving, but pressing Enter in the input
  // calls save again directly; a ref sees the first call at once.
  const savingApiKeyRef = useRef(false)

  const loadInstalled = useCallback(() => {
    const read = ++latestInstalledReadRef.current
    const apply = (result: SteamInstalledResult | 'failed'): void => {
      if (read !== latestInstalledReadRef.current) return
      // Before the first read the list is empty, which nextSteamInstalled
      // treats like "nothing seen yet".
      setInstalled((previous) => nextSteamInstalled(previous, result))
      setInstalledLoaded(true)
    }
    window.api.steam
      .getInstalledGames()
      .then(apply)
      // A friendly empty state beats a raw error: detection failing quietly
      // is the same as "no games found" from the user's view on a first read,
      // and keeps the list on a later one.
      .catch(() => apply('failed'))
  }, [])

  const connect = useCallback(() => {
    setConnectError(null)
    setConnecting(true)
    window.api.steam
      .signIn()
      .then(setConnection)
      .catch(() => {
        setConnectError('Could not connect to Steam. Please try again.')
      })
      .finally(() => setConnecting(false))
  }, [])

  const cancelConnect = useCallback(() => {
    void window.api.steam.cancelSignIn()
  }, [])

  const saveApiKey = useCallback(
    async (apiKey: string): Promise<boolean> => {
      // Guards against a save already in flight and this new one resolving
      // out of order.
      if (savingApiKeyRef.current) return false
      savingApiKeyRef.current = true
      setApiKeyError(null)
      setSavingApiKey(true)
      try {
        const status = await window.api.steam.setApiKey(apiKey)
        setConnection(status)
        // A new key deserves a fresh attempt now, and must not sit under the
        // previous key's "turned down" notice while it loads. Neither changes
        // the effect's other dependencies when the key is merely replaced.
        setOwnedGamesResult(null)
        refreshOwned()
        return true
      } catch (err: unknown) {
        // The main-process handler already produces a friendly message for
        // both a malformed key and an encryption failure; surface it as-is
        // rather than a second, generic one.
        setApiKeyError(err instanceof Error ? err.message : 'Could not save the API key.')
        return false
      } finally {
        savingApiKeyRef.current = false
        setSavingApiKey(false)
      }
    },
    [refreshOwned]
  )

  const clearApiKey = useCallback(() => {
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
  }, [])

  useEffect(() => {
    loadInstalled()
    // A game installed or removed through Steam shows up (and moves between
    // Installed and Library) when the user comes back to this window.
    window.addEventListener('focus', loadInstalled)

    window.api.steam
      .getConnectionStatus()
      .then(setConnection)
      .catch(() => setConnection(null))
      .finally(() => setConnectionLoaded(true))

    return () => window.removeEventListener('focus', loadInstalled)
  }, [loadInstalled])

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
      timer = setTimeout(refreshOwned, ONLINE_DEBOUNCE_MS)
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      clearTimeout(timer)
    }
  }, [refreshOwned])

  // New covers finished downloading. Until now the grid was showing the remote
  // URLs; re-read the library (main now returns local URLs for what is on
  // disk) and swap just the cover URLs in, so the local copies are used this
  // session instead of only after a restart. The installed list is re-read
  // too: covers main looked up for installed games that aren't owned only
  // come through it.
  useEffect(() => {
    return window.api.steam.onCoversChanged(() => {
      setCoverRetryToken((token) => token + 1)
      loadInstalled()
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
  }, [loadInstalled])

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
  const showOwned = connection?.status === 'connected' && connection.hasApiKey === true
  const ownedError = ownedGamesForCurrentAccount?.error ?? null
  const libraryProblem = ownedGamesForCurrentAccount?.problem ?? null
  const cachedGames =
    cachedLibrary !== null && cachedLibrary.steamId64 === currentSteamId64
      ? cachedLibrary.games
      : null
  // Live result wins; the saved copy fills the gap until it arrives, and
  // stays on screen if the live fetch fails. Nothing to show without a key.
  const owned = showOwned ? (ownedGamesForCurrentAccount?.games ?? cachedGames) : null
  const loadingOwned = showOwned && owned === null && ownedError === null && libraryProblem === null
  const notice = libraryProblem !== null ? libraryNotice(libraryProblem, owned !== null) : null
  const needsRetry = showOwned && (libraryProblem !== null || ownedError !== null)
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
      if (!refreshingRef.current) refreshOwned()
    }, retryDelayMs(failures))
    return () => clearTimeout(timer)
  }, [needsRetry, failures, refreshOwned])

  return {
    installed,
    installedLoaded,
    coverRetryToken,
    connection,
    connectionLoaded,
    connecting,
    connectError,
    connect,
    cancelConnect,
    savingApiKey,
    apiKeyError,
    saveApiKey,
    clearApiKey,
    showOwned,
    owned,
    loadingOwned,
    notice,
    ownedError,
    needsRetry,
    refreshOwned
  }
}
