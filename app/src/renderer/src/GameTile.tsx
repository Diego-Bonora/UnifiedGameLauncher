import { useLayoutEffect, useRef } from 'react'
import { STORES } from '@shared/stores'
import GameCoverArt from './GameCoverArt'
import type { GameCard } from './game-cards'
import type { HandOffKind } from './hand-off'

interface GameTileProps {
  card: GameCard
  // Installed cards play, Library cards install.
  kind: HandOffKind
  // The small store badge on the cover: only in All games, where stores mix.
  showBadge: boolean
  // See GameCoverArt: a new value gives a failed cover another try.
  coverRetryToken?: number
  // Some launch or install is in progress: every card pauses, not just the
  // one clicked.
  busy: boolean
  // This card is the one being launched or installed.
  active: boolean
  onStart: () => void
  favorite: boolean
  onToggleFavorite: () => void
}

// A five-pointed star computed from two circles (points alternate between an
// outer and an inner radius), not taken from an icon set.
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 9 : 3.8
  const angle = (Math.PI / 5) * i - Math.PI / 2
  return `${(12 + radius * Math.cos(angle)).toFixed(2)},${(12.5 + radius * Math.sin(angle)).toFixed(2)}`
}).join(' ')

function StarIcon({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-2 w-2"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <polygon points={STAR_POINTS} />
    </svg>
  )
}

// One game as a poster. The whole tile is the button: no separate Play
// control, just the hover lift and accent ring that mark it as clickable. It
// is a real <button>, so it works from the keyboard, and the aria-label says
// what it does. `data-card-key` (on the wrapper, so the star counts too) lets
// the library screen find where keyboard focus was when a card moves between sections.
//
// aria-disabled, not the disabled attribute, while busy: a disabled button
// drops keyboard focus (and its focus ring) in the middle of a launch.
//
// The favorite star is a second button beside the main one, never inside it
// (a button in a button is invalid and breaks the keyboard). The wrapper is a
// `group` as well, so hovering the star keeps the cover lifted.
function GameTile({
  card,
  kind,
  showBadge,
  coverRetryToken,
  busy,
  active,
  onStart,
  favorite,
  onToggleFavorite
}: GameTileProps): React.JSX.Element {
  const pausedClasses = active ? 'cursor-wait opacity-60' : busy ? 'cursor-default opacity-60' : ''
  const storeName = STORES.find((store) => store.id === card.store)?.name ?? card.store
  const action = kind === 'launch' ? 'Play' : 'Install'

  // Starring re-sorts the section, and React may move this card's element to
  // its new place, which drops keyboard focus to the page. That happens twice
  // when a save fails (the star flips back and the card moves back), so
  // "the star has focus" is remembered until focus really goes elsewhere: a
  // blur with somewhere to go (relatedTarget), or another element focused by
  // the time the star changes. A move drops focus to nowhere.
  const starRef = useRef<HTMLButtonElement>(null)
  const starHasFocusRef = useRef(false)
  useLayoutEffect(() => {
    if (!starHasFocusRef.current) return
    const active = document.activeElement
    if (active === starRef.current) return
    if (active !== null && active !== document.body) {
      starHasFocusRef.current = false
      return
    }
    starRef.current?.focus()
  }, [favorite])

  return (
    <div data-card-key={card.key} className="group relative min-w-0">
      <button
        type="button"
        onClick={() => {
          if (!busy) onStart()
        }}
        aria-disabled={busy}
        aria-label={`${action} ${card.title}`}
        className={`peer group flex w-full min-w-0 flex-col gap-1 text-left focus-visible:outline-none ${pausedClasses}`}
      >
        <div className="relative">
          <GameCoverArt
            coverUrl={card.coverUrl}
            placeholderLabel={card.title}
            retryToken={coverRetryToken}
          />
          {showBadge && (
            // Decorative: the button's label says what it does. Lifts with the
            // cover (same distance and timing) so it stays put on the poster.
            <span
              aria-hidden="true"
              className="absolute left-1 top-1 rounded-full bg-background/80 px-1 text-xs text-muted transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:-translate-y-1"
            >
              {storeName}
            </span>
          )}
        </div>
        <span className="truncate text-sm text-muted" title={card.title}>
          {active ? (kind === 'launch' ? 'Starting…' : 'Opening Steam…') : card.title}
        </span>
      </button>
      {/* Works during the launch pause (it neither launches nor installs).
          Shown on starred cards, and on hover or keyboard focus for the rest.
          A fixed label with aria-pressed: the pressed state says whether it's
          starred, so the label doesn't flip too. */}
      <button
        ref={starRef}
        type="button"
        onClick={onToggleFavorite}
        onFocus={() => {
          starHasFocusRef.current = true
        }}
        onBlur={(event) => {
          if (event.relatedTarget !== null) starHasFocusRef.current = false
        }}
        aria-pressed={favorite}
        aria-label={`Favorite ${card.title}`}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background/80 transition-[transform,opacity] duration-150 group-hover:-translate-y-1 peer-focus-visible:-translate-y-1 hover:text-accent-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          favorite
            ? 'text-accent'
            : // Faint, not hidden, where there is no hover (touch screens):
              // an invisible star could still be tapped by accident.
              'text-muted opacity-0 group-hover:opacity-100 peer-focus-visible:opacity-100 [@media(hover:none)]:opacity-40'
        }`}
      >
        <StarIcon filled={favorite} />
      </button>
    </div>
  )
}

export default GameTile
