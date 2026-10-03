import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_NAME } from '@shared/app-info'
import LibraryScreen from './LibraryScreen'
import { ManualGameFormDialog, RemoveGameDialog } from './ManualGameDialogs'
import SettingsScreen from './SettingsScreen'
import Sidebar from './Sidebar'
import type { Screen } from './navigation'
import { useEpicLibrary } from './use-epic-library'
import { useFavorites } from './use-favorites'
import { useHandOff } from './use-hand-off'
import { useManualActions } from './use-manual-actions'
import { useManualGames } from './use-manual-games'
import { useSteamLibrary } from './use-steam-library'

const SIDEBAR_ID = 'app-sidebar'

function MenuIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function App(): React.JSX.Element {
  // App-wide state lives in these hooks, not in a screen, so switching views
  // or opening Settings never resets a list, a retry or a launch pause
  // (docs/features/library-layout.md, "App-wide state").
  const steam = useSteamLibrary()
  const epic = useEpicLibrary()
  const manual = useManualGames()
  // When what opened a manual-game dialog is gone (a removed game's ⋯
  // button), focus goes to the Installed heading instead of the page.
  const focusInstalledHeading = useCallback(() => {
    document.querySelector<HTMLElement>('[data-section="installed"] h2')?.focus()
  }, [])
  const manualActions = useManualActions(manual, focusInstalledHeading)
  const favorites = useFavorites()
  const handOff = useHandOff((store) => {
    if (store === 'epic') epic.reloadGames()
    if (store === 'manual') manual.reload()
  })

  // Always opens on All games; the last view is not remembered (spec).
  const [screen, setScreen] = useState<Screen>('all')
  // One search for every game view; not saved, so each start is unfiltered.
  const [searchQuery, setSearchQuery] = useState('')
  // Below 768 px the sidebar is a drawer over the content; this is whether
  // it's slid in. Ignored at wider sizes, where the sidebar always shows.
  const [menuOpen, setMenuOpen] = useState(false)
  // Settings was opened from an "Open Settings" button in a game view.
  const [settingsFromButton, setSettingsFromButton] = useState(false)
  // Set when the drawer is closed by the user, so focus returns to ☰ once
  // the content is no longer inert (it is while the drawer is open).
  const returnFocusRef = useRef(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  // Focus goes back to the ☰ button (in the effect below), so a keyboard user
  // isn't left on a control that just slid out of view.
  const closeMenu = useCallback(() => {
    returnFocusRef.current = true
    setMenuOpen(false)
  }, [])

  const select = (next: Screen): void => {
    setScreen(next)
    setSettingsFromButton(false)
    if (menuOpen) closeMenu()
  }

  // Widening the window past the breakpoint turns the drawer into the fixed
  // sidebar; close it quietly (no focus move: ☰ isn't shown any more), or it
  // would come back open, without focus, when the window is narrowed again.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const handleChange = (): void => {
      if (wide.matches) setMenuOpen(false)
    }
    wide.addEventListener('change', handleChange)
    return () => wide.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      if (returnFocusRef.current) {
        returnFocusRef.current = false
        menuButtonRef.current?.focus()
      }
      return
    }
    // Into the drawer, so Tab continues from its entries rather than from
    // the content behind it.
    sidebarRef.current?.querySelector('button')?.focus()
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [menuOpen, closeMenu])

  // A new screen starts at the top, not at the old one's scroll position.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [screen])

  return (
    <div className="flex h-full">
      {menuOpen && (
        // Click outside the drawer closes it. Not a control of its own (the
        // drawer's entries and Esc do the same from the keyboard).
        <div
          aria-hidden="true"
          onClick={closeMenu}
          className="fixed inset-0 z-20 bg-background/70 md:hidden"
        />
      )}
      {/* One sidebar for both sizes. While the drawer is closed it is also
          invisible, which takes its buttons out of the Tab order. */}
      <aside
        id={SIDEBAR_ID}
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-30 w-28 shrink-0 border-r border-border bg-surface duration-200 md:static md:translate-x-0 ${
          menuOpen
            ? // Visible at once, so focus can move in straight away.
              'translate-x-0 transition-transform'
            : // Stays visible while it slides out, then hides.
              '-translate-x-full transition-[transform,visibility] max-md:invisible'
        }`}
      >
        <Sidebar screen={screen} onSelect={select} />
      </aside>

      {/* Inert while the drawer is open: Tab and screen readers stay in the
          drawer instead of wandering into the dimmed content behind it. */}
      <div className="flex min-w-0 flex-1 flex-col" inert={menuOpen}>
        <header className="flex items-center gap-2 border-b border-border px-2 py-1 md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls={SIDEBAR_ID}
            className="rounded-control p-1 text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MenuIcon />
          </button>
          <span className="truncate font-display font-semibold">{APP_NAME}</span>
        </header>

        <main ref={mainRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* The one launch/install message line, above whatever screen is
              open, so a launch from one view still reports in another. */}
          {handOff.feedback?.tone === 'danger' && (
            <p role="alert" className="text-danger">
              {handOff.feedback.message}
            </p>
          )}
          {manualActions.message?.tone === 'danger' && (
            <p role="alert" className="text-danger">
              {manualActions.message.text}
            </p>
          )}
          {manualActions.message?.tone === 'info' && (
            <p role="status" className="text-sm text-muted">
              {manualActions.message.text}
            </p>
          )}
          {favorites.problem !== null && (
            <p role="alert" className="text-danger">
              {favorites.problem}
            </p>
          )}
          {handOff.feedback?.tone === 'info' && (
            <p role="status" className="text-sm text-muted">
              {handOff.feedback.message}
            </p>
          )}

          {screen === 'settings' ? (
            <SettingsScreen steam={steam} epic={epic} focusHeading={settingsFromButton} />
          ) : (
            <LibraryScreen
              view={screen}
              steam={steam}
              epic={epic}
              manual={manual}
              manualActions={manualActions}
              handOff={handOff}
              favorites={favorites}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenSettings={() => {
                setScreen('settings')
                setSettingsFromButton(true)
              }}
            />
          )}
        </main>
      </div>
      {manualActions.dialog?.kind === 'form' && (
        <ManualGameFormDialog
          // A new dialog starts from its own values, not the last one's.
          key={`${manualActions.dialog.mode}:${manualActions.dialog.game?.id ?? 'new'}`}
          mode={manualActions.dialog.mode}
          initial={manualActions.dialog.initial}
          gameTitle={manualActions.dialog.game?.title}
          busy={manualActions.busy}
          problem={manualActions.formProblem}
          onSave={manualActions.save}
          onCancel={manualActions.cancel}
        />
      )}
      {manualActions.dialog?.kind === 'remove' && (
        <RemoveGameDialog
          gameTitle={manualActions.dialog.game.title}
          busy={manualActions.busy}
          onRemove={manualActions.confirmRemove}
          onCancel={manualActions.cancel}
        />
      )}
    </div>
  )
}

export default App
