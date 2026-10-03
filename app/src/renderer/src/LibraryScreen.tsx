import EpicInstalledSection from './EpicInstalledSection'
import GameCoverArt from './GameCoverArt'
import { buildViewSections, type LibraryView } from './game-cards'
import { COVER_KEY_REJECTED_NOTICE, showCoverKeyRejectedNotice } from './epic-cover-messages'
import { screenLabel } from './navigation'
import type { EpicLibrary } from './use-epic-library'
import type { HandOff } from './use-hand-off'
import type { SteamLibrary } from './use-steam-library'

interface LibraryScreenProps {
  view: LibraryView
  steam: SteamLibrary
  epic: EpicLibrary
  handOff: HandOff
  onOpenSettings: () => void
}

function OpenSettingsButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
    >
      Open Settings
    </button>
  )
}

// One game view: All games or a single store. This step only splits the old
// single page by store; the Installed/Library grid replaces these lists next.
function LibraryScreen({
  view,
  steam,
  epic,
  handOff,
  onOpenSettings
}: LibraryScreenProps): React.JSX.Element {
  const showSteam = view === 'all' || view === 'steam'
  const showEpic = view === 'all' || view === 'epic'
  const data = {
    steamInstalled: steam.installed,
    steamOwned: steam.owned,
    epicInstalled: epic.games
  }
  const steamInstalledCards = buildViewSections('steam', data).installed
  const epicCards = buildViewSections('epic', data).installed
  const { owned, loadingOwned, notice, ownedError, needsRetry } = steam

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{screenLabel(view)}</h1>

      {showEpic && showCoverKeyRejectedNotice(epic.coverStatus) && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-danger">{COVER_KEY_REJECTED_NOTICE}</p>
          <OpenSettingsButton onClick={onOpenSettings} />
        </div>
      )}

      {showSteam && steam.connectionLoaded && !steam.showOwned && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted">
            Connect Steam and add your Steam Web API key in Settings to see games you own but
            haven&apos;t installed.
          </p>
          <OpenSettingsButton onClick={onOpenSettings} />
        </div>
      )}

      {showSteam && steam.showOwned && (
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
              {notice?.opensSettings === true && <OpenSettingsButton onClick={onOpenSettings} />}
              {ownedError !== null && <p className="text-danger">{ownedError}</p>}
              {ownedError !== null && owned !== null && (
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
          {loadingOwned && (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <div key={key} className="aspect-[2/3] animate-pulse rounded-card bg-surface-2" />
              ))}
            </div>
          )}
          {!loadingOwned && owned !== null && owned.length === 0 && (
            <p className="text-muted">
              No games found. Your Steam library might be empty, or your profile&apos;s game details
              might be set to private.
            </p>
          )}
          {!loadingOwned && owned !== null && owned.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
              {owned.map((game) => (
                <li key={game.appId} className="flex min-w-0 flex-col gap-2">
                  <GameCoverArt coverUrl={game.coverUrl} />
                  <span className="truncate text-sm text-muted">{game.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showSteam && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Installed Steam games</h2>
          {!steam.installedLoaded && (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-14 animate-pulse rounded-card bg-surface-2" />
              ))}
            </div>
          )}
          {steam.installedLoaded && steamInstalledCards.length === 0 && (
            <p className="text-muted">No Steam games installed on this PC.</p>
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
        </section>
      )}

      {showEpic && <EpicInstalledSection epic={epic} cards={epicCards} handOff={handOff} />}
    </div>
  )
}

export default LibraryScreen
