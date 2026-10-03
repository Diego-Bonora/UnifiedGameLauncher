import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import GameSection from './GameSection'
import GameTile from './GameTile'
import SearchBox from './SearchBox'
import { COVER_KEY_REJECTED_NOTICE, showCoverKeyRejectedNotice } from './epic-cover-messages'
import {
  buildViewSections,
  focusAfterChange,
  viewHasLibrary,
  type GameCard,
  type LibraryView,
  type SectionName
} from './game-cards'
import { countCards, filterSections, noMatchMessage, searchTerm } from './game-search'
import type { HandOffKind } from './hand-off'
import { screenLabel } from './navigation'
import type { EpicLibrary } from './use-epic-library'
import type { HandOff } from './use-hand-off'
import type { SteamLibrary } from './use-steam-library'

interface LibraryScreenProps {
  view: LibraryView
  steam: SteamLibrary
  epic: EpicLibrary
  handOff: HandOff
  // App-wide, so it survives a view switch (docs/features/library-tools.md).
  searchQuery: string
  onSearchChange: (query: string) => void
  onOpenSettings: () => void
}

const BUTTON =
  'rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2'

function OpenSettingsButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className={BUTTON}>
      Open Settings
    </button>
  )
}

const INSTALLED_EMPTY: Record<LibraryView, string> = {
  all: 'No installed games found on this PC.',
  steam: 'No Steam games installed on this PC.',
  epic: 'No Epic games installed on this PC.'
}

// One game view (All games, or one store): an Installed section, then a
// Library section of owned games that aren't installed, for views whose
// stores can list those (docs/features/library-layout.md, "Game views").
function LibraryScreen({
  view,
  steam,
  epic,
  handOff,
  searchQuery,
  onSearchChange,
  onOpenSettings
}: LibraryScreenProps): React.JSX.Element {
  // Rebuilt only when a list or the view changes, not on every render (each
  // click and the end of every launch pause re-render this screen).
  const { installed: steamInstalled, owned: steamOwned } = steam
  const allSections = useMemo(
    () =>
      buildViewSections(view, {
        steamInstalled,
        steamOwned,
        epicInstalled: epic.games
      }),
    [view, steamInstalled, steamOwned, epic.games]
  )
  // Filtered after the sections are built, so search never changes which
  // section a game is in or the order. The rest of this screen (focus moves
  // included) works on what is shown. Deferred: the box updates on every key,
  // while the grid (thousands of tiles mounting when a search is cleared)
  // follows when React has time, so typing never stutters.
  const shownQuery = useDeferredValue(searchQuery)
  const sections = useMemo(() => filterSections(allSections, shownQuery), [allSections, shownQuery])
  const searching = searchTerm(shownQuery) !== ''
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Ctrl+F jumps to the search box. Only while a game view is open (this
  // screen is unmounted in Settings). Cmd+F as well, for dev on a Mac.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      // `code` is the physical key, so Ctrl+F works on any keyboard layout
      // (a Russian layout reports key "а"); `key` covers layouts that move F.
      const isF = event.code === 'KeyF' || event.key.toLowerCase() === 'f'
      if (!isF || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      // An open dialog or menu keeps focus (spec): Ctrl+F does nothing there.
      // No dialogs exist yet; manual games' Add/Rename/Remove and ⋯ menu must
      // use these roles for this to hold.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
  // The Library section below is Steam's: Steam is the only store with an
  // owned library today. A second store with `hasLibrary` needs its own
  // loading, notices and empty states here, not Steam's.
  const hasLibrary = viewHasLibrary(view)
  const includesSteam = view === 'all' || view === 'steam'
  const includesEpic = view === 'all' || view === 'epic'
  const installedLoading =
    (includesSteam && !steam.installedLoaded) || (includesEpic && !epic.loaded)
  // Also while the first connection read runs (so a connected user never sees
  // the "Connect Steam" line flash by), and until the installed list is in:
  // before that every owned game would show here as "Install", including the
  // ones already on this PC.
  const libraryLoading = !steam.connectionLoaded || steam.loadingOwned || !steam.installedLoaded

  // Keyboard focus that would be lost when a refresh moves the focused card to
  // the other section (React then unmounts it) or removes it. Tracked through
  // focusin, which a removed element never fires, so the ref still names the
  // card after it is gone.
  const lastFocusedRef = useRef<{ key: string; section: SectionName } | null>(null)
  const installedHeadingRef = useRef<HTMLHeadingElement>(null)
  const libraryHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const key = target?.dataset['cardKey']
      const section = target?.closest('[data-section]')?.getAttribute('data-section')
      lastFocusedRef.current =
        key !== undefined && (section === 'installed' || section === 'library')
          ? { key, section }
          : null
    }
    // Focus leaving a card that still exists a moment later was the user's
    // own doing (a click on empty space drops focus to the page body too), so
    // a later move of that card must not pull focus back to a heading. A card
    // that was removed is not connected any more, and stays remembered.
    const handleFocusOut = (event: FocusEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.dataset['cardKey'] === undefined) return
      setTimeout(() => {
        if (target.isConnected && lastFocusedRef.current?.key === target.dataset['cardKey']) {
          lastFocusedRef.current = null
        }
      }, 0)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  // Before paint, so the heading has focus by the time the user sees the move.
  useLayoutEffect(() => {
    const focused = lastFocusedRef.current
    if (focused === null || document.activeElement !== document.body) return
    const target = focusAfterChange(focused, sections)
    if (target === null) return
    lastFocusedRef.current = null
    const heading = target === 'installed' ? installedHeadingRef.current : libraryHeadingRef.current
    heading?.focus()
  })

  const renderCards = (cards: GameCard[], kind: HandOffKind): React.ReactNode =>
    cards.map((card) => (
      <li key={card.key} className="min-w-0">
        <GameTile
          card={card}
          kind={kind}
          showBadge={view === 'all'}
          coverRetryToken={card.store === 'epic' ? epic.coverRetryToken : steam.coverRetryToken}
          busy={handOff.activeKey !== null}
          active={handOff.activeKey === card.key}
          onStart={() => handOff.start(card, kind)}
        />
      </li>
    ))

  const { owned, notice, ownedError, needsRetry } = steam
  const libraryNotices = needsRetry && (
    <div className="flex flex-wrap items-center gap-2">
      {notice?.tone === 'pill' && (
        <p
          role="status"
          className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
        >
          <span className="h-1 w-1 rounded-full bg-muted" aria-hidden="true" />
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
      <button type="button" onClick={steam.refreshOwned} className={BUTTON}>
        Try again
      </button>
    </div>
  )

  // What the Library section says instead of a grid. A missing connection or
  // key comes first: until then there is no owned list to compare with.
  const libraryEmpty = !steam.showOwned ? (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-muted">
        Connect Steam and add your Steam Web API key in Settings to see games you own but
        haven&apos;t installed.
      </p>
      <OpenSettingsButton onClick={onOpenSettings} />
    </div>
  ) : owned === null ? null : owned.length === 0 ? (
    <p className="text-muted">
      No games found. Your Steam library might be empty, or your profile&apos;s game details might
      be set to private.
    </p>
  ) : (
    <p className="text-muted">Every game you own is installed.</p>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{screenLabel(view)}</h1>
        <SearchBox
          query={searchQuery}
          onChange={onSearchChange}
          matchCount={
            // Only what is on screen: skeletons hide cards a section already
            // holds, and a deferred grid may still show the previous query.
            installedLoading ||
            (hasLibrary && includesSteam && libraryLoading) ||
            shownQuery !== searchQuery
              ? null
              : countCards(sections)
          }
          inputRef={searchInputRef}
        />
      </div>

      {includesEpic && showCoverKeyRejectedNotice(epic.coverStatus) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-danger">{COVER_KEY_REJECTED_NOTICE}</p>
          <OpenSettingsButton onClick={onOpenSettings} />
        </div>
      )}

      <div data-section="installed">
        <GameSection
          id={`${view}-installed`}
          title="Installed"
          headingRef={installedHeadingRef}
          loading={installedLoading}
          empty={
            // A search can't fix an empty list, so only a list that had games
            // gets the "no match" line.
            <p className="text-muted">
              {searching && allSections.installed.length > 0
                ? noMatchMessage('installed', shownQuery)
                : INSTALLED_EMPTY[view]}
            </p>
          }
          hasCards={sections.installed.length > 0}
        >
          {renderCards(sections.installed, 'launch')}
        </GameSection>
      </div>

      {hasLibrary && includesSteam && sections.library !== null && (
        <div data-section="library">
          <GameSection
            id={`${view}-library`}
            title="Library"
            headingRef={libraryHeadingRef}
            loading={libraryLoading}
            notices={steam.showOwned ? libraryNotices : null}
            empty={
              steam.showOwned && searching && (allSections.library?.length ?? 0) > 0 ? (
                <p className="text-muted">{noMatchMessage('library', shownQuery)}</p>
              ) : (
                libraryEmpty
              )
            }
            hasCards={sections.library.length > 0}
          >
            {renderCards(sections.library, 'install')}
          </GameSection>
        </div>
      )}
    </div>
  )
}

export default LibraryScreen
