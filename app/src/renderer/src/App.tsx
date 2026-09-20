import { useEffect, useState } from 'react'
import { APP_NAME } from '@shared/app-info'
import type {
  SteamConnectionStatus,
  SteamInstalledGame,
  SteamOwnedGame
} from '@shared/ipc/steam-channels'
import GameCoverArt from './GameCoverArt'

type LoadState = 'loading' | 'loaded'

// Tagged with the steamId64 it was fetched for, so a render can tell a
// finished result apart from one that belongs to a PREVIOUS account (after
// reconnecting as someone else) purely by comparison — no explicit "reset to
// null" setState call needed in the effect below, which would otherwise run
// synchronously in the effect body and trip react-hooks/set-state-in-effect
// (see the getInstalledGames effect above for the same reasoning).
type OwnedGamesResult =
  { steamId64: string; games: SteamOwnedGame[] } | { steamId64: string; error: string }

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
  const [cachedLibrary, setCachedLibrary] = useState<{
    steamId64: string
    games: SteamOwnedGame[]
  } | null>(null)

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
      .then(setConnection)
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
    if (connection?.status !== 'connected' || !connection.hasApiKey) return
    const steamId64 = connection.steamId64
    // Guards against two overlapping fetches (e.g. the user toggles the API
    // key or reconnects twice in quick succession) resolving out of order —
    // the cleanup below marks THIS run's promise stale before a newer run's
    // effect body starts, so only the latest one is ever allowed to setState.
    let ignore = false
    window.api.steam
      .getOwnedGames()
      .then((games) => {
        if (!ignore) setOwnedGamesResult({ steamId64, games })
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setOwnedGamesResult({
            steamId64,
            error: err instanceof Error ? err.message : 'Could not load your Steam library.'
          })
        }
      })
    return () => {
      ignore = true
    }
  }, [connection?.status, connection?.hasApiKey, connection?.steamId64])

  // Saved copy of the library, shown instantly while the live fetch above is
  // still running. Same steamId64 tagging and `ignore` guard as that effect.
  useEffect(() => {
    if (connection?.status !== 'connected' || !connection.hasApiKey) return
    const steamId64 = connection.steamId64
    let ignore = false
    window.api.steam
      .getCachedLibrary()
      .then((games) => {
        if (!ignore && games !== null) setCachedLibrary({ steamId64, games })
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
  const ownedGamesError =
    ownedGamesForCurrentAccount !== null && 'error' in ownedGamesForCurrentAccount
      ? ownedGamesForCurrentAccount.error
      : null
  const cachedGames =
    cachedLibrary !== null && cachedLibrary.steamId64 === currentSteamId64
      ? cachedLibrary.games
      : null
  // Live result wins; the saved copy fills the gap until it arrives, and
  // stays on screen if the live fetch fails.
  const ownedGames =
    ownedGamesForCurrentAccount !== null && 'games' in ownedGamesForCurrentAccount
      ? ownedGamesForCurrentAccount.games
      : cachedGames
  const loadingOwnedGames = showOwnedGames && ownedGames === null && ownedGamesError === null

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
          {ownedGamesError !== null && <p className="text-danger">{ownedGamesError}</p>}
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
    </main>
  )
}

export default App
