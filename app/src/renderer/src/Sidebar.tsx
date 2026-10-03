import { APP_NAME } from '@shared/app-info'
import { LIBRARY_ENTRIES, type Screen } from './navigation'

interface SidebarProps {
  screen: Screen
  onSelect: (screen: Screen) => void
}

const ENTRY_BASE =
  'flex w-full items-center gap-2 rounded-control border-l-2 px-2 py-1 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const ENTRY_ACTIVE = 'border-accent bg-surface-2 text-text'
const ENTRY_IDLE = 'border-transparent text-muted hover:bg-surface-2 hover:text-text'

function entryClass(active: boolean): string {
  return `${ENTRY_BASE} ${active ? ENTRY_ACTIVE : ENTRY_IDLE}`
}

// Drawn inline rather than from an icon package: one small shape, and nothing
// to load (the app works offline and the CSP allows no external images).
function GearIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-2 w-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      {/* Eight teeth, every 45 degrees around the ring. */}
      <path d="M19 12h2.5M5 12H2.5M12 19v2.5M12 5V2.5M16.95 16.95l1.77 1.77M7.05 7.05 5.28 5.28M7.05 16.95l-1.77 1.77M16.95 7.05l1.77-1.77" />
    </svg>
  )
}

// The app name, the game views (All games, then one per store) and Settings
// pinned to the bottom. Store names only, no store logos (docs/brand.md: logos
// only as small badges on games). Entries are real buttons, so they work from
// the keyboard; the current one carries aria-current.
function Sidebar({ screen, onSelect }: SidebarProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col gap-3 p-2">
      <p className="truncate font-display text-sm font-semibold">{APP_NAME}</p>
      <nav aria-label="Game views" className="flex flex-col gap-1">
        {LIBRARY_ENTRIES.map((entry) => (
          <button
            key={entry.screen}
            type="button"
            onClick={() => onSelect(entry.screen)}
            aria-current={screen === entry.screen ? 'page' : undefined}
            className={entryClass(screen === entry.screen)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto">
        <button
          type="button"
          onClick={() => onSelect('settings')}
          aria-current={screen === 'settings' ? 'page' : undefined}
          className={entryClass(screen === 'settings')}
        >
          <GearIcon />
          Settings
        </button>
      </div>
    </div>
  )
}

export default Sidebar
