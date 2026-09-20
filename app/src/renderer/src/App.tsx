import { useEffect, useState } from 'react'
import { APP_NAME } from '@shared/app-info'
import type { SteamConnectionStatus, SteamInstalledGame } from '@shared/ipc/steam-channels'

type LoadState = 'loading' | 'loaded'

function App(): React.JSX.Element {
  const [state, setState] = useState<LoadState>('loading')
  const [games, setGames] = useState<SteamInstalledGame[]>([])
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [connection, setConnection] = useState<SteamConnectionStatus | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

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

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-4">
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
