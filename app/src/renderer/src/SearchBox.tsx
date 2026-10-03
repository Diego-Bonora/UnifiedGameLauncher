import { useEffect, useState } from 'react'
import { matchCountMessage, searchTerm } from './game-search'

interface SearchBoxProps {
  query: string
  onChange: (query: string) => void
  // Cards shown in the whole view for the current query, announced once
  // typing stops. null while that isn't known yet (a section still shows
  // skeletons, or the grid hasn't caught up with the latest key): nothing is
  // announced then, rather than a count the screen doesn't show.
  matchCount: number | null
  inputRef: React.RefObject<HTMLInputElement | null>
}

// How long typing must pause before the count is announced: announcing on
// every key would make a screen reader read over the user's typing.
const ANNOUNCE_DELAY_MS = 500

// Drawn from two lines, not taken from an icon set.
function ClearIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-2 w-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// The search box at the top of every game view (docs/features/library-tools.md,
// "Search"). The query itself lives in App, so it survives a view switch.
function SearchBox({ query, onChange, matchCount, inputRef }: SearchBoxProps): React.JSX.Element {
  // Kept with the query and count it was made for: a stale one (from before
  // the latest key, a cleared search, or a refresh that changed the grid) is
  // never shown, so the live region can't read out a wrong number.
  const [announced, setAnnounced] = useState<{ query: string; count: number } | null>(null)
  const searching = searchTerm(query) !== ''
  const announcement =
    searching && matchCount !== null && announced?.query === query && announced.count === matchCount
      ? matchCountMessage(matchCount)
      : ''

  useEffect(() => {
    if (!searching || matchCount === null) return
    const timer = setTimeout(() => setAnnounced({ query, count: matchCount }), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searching, query, matchCount])

  const clear = (): void => {
    onChange('')
    // The × button is about to disappear; keep the user in the box.
    inputRef.current?.focus()
  }

  return (
    <div className="relative w-full max-w-40">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query !== '') {
            event.preventDefault()
            onChange('')
          }
        }}
        aria-label="Search games"
        placeholder="Search games"
        spellCheck={false}
        autoComplete="off"
        // The browser's own clear button is hidden: ours is the same size in
        // every theme and returns focus to the box.
        className="w-full rounded-control border border-border bg-surface py-1 pl-2 pr-4 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query !== '' && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex items-center rounded-control px-1 text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ClearIcon />
        </button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

export default SearchBox
