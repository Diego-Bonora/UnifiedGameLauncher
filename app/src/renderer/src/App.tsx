import { useState } from 'react'
import { APP_NAME } from '@shared/app-info'
import EpicInstalledSection from './EpicInstalledSection'
import GameCoverArt from './GameCoverArt'
import { buildViewSections } from './game-cards'
import { useEpicLibrary } from './use-epic-library'
import { useHandOff } from './use-hand-off'
import { useSteamLibrary } from './use-steam-library'

function App(): React.JSX.Element {
  // App-wide state lives in these hooks, not in a view, so it survives the
  // view switches the new layout adds (docs/features/library-layout.md).
  const steam = useSteamLibrary()
  const epic = useEpicLibrary()
  const handOff = useHandOff((store) => {
    if (store === 'epic') epic.reloadGames()
  })
  const [apiKeyInput, setApiKeyInput] = useState('')

  const data = {
    steamInstalled: steam.installed,
    steamOwned: steam.owned,
    epicInstalled: epic.games
  }
  const steamInstalledCards = buildViewSections('steam', data).installed
  const epicCards = buildViewSections('epic', data).installed

  const handleSaveApiKey = (event: React.FormEvent): void => {
    event.preventDefault()
    void steam.saveApiKey(apiKeyInput).then((saved) => {
      if (saved) setApiKeyInput('')
    })
  }

  const {
    connection,
    connecting,
    connectError,
    apiKeyError,
    savingApiKey,
    showOwned: showOwnedGames,
    owned: ownedGames,
    loadingOwned: loadingOwnedGames,
    notice,
    ownedError: ownedGamesError,
    needsRetry
  } = steam

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
            onClick={steam.cancelConnect}
            className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={steam.connect}
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
              onClick={steam.clearApiKey}
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
                onClick={steam.refreshOwned}
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

      {handOff.feedback?.tone === 'danger' && (
        <p role="alert" className="text-danger">
          {handOff.feedback.message}
        </p>
      )}
      {handOff.feedback?.tone === 'info' && (
        <p role="status" className="text-sm text-muted">
          {handOff.feedback.message}
        </p>
      )}

      {!steam.installedLoaded && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-14 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}

      {steam.installedLoaded && steamInstalledCards.length === 0 && (
        <p className="text-muted">No installed Steam games found on this PC.</p>
      )}

      {steam.installedLoaded && steamInstalledCards.length > 0 && (
        <ul className="flex flex-col gap-2">
          {steamInstalledCards.map((game) => (
            <li
              key={game.key}
              className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3"
            >
              <span>{game.title}</span>
              <button
                type="button"
                onClick={() => handOff.start(game, 'launch')}
                aria-disabled={handOff.activeKey !== null}
                className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover"
              >
                Play
              </button>
            </li>
          ))}
        </ul>
      )}

      <EpicInstalledSection epic={epic} cards={epicCards} handOff={handOff} />
    </main>
  )
}

export default App
