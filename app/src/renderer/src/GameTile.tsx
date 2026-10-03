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
}

// One game as a poster. The whole tile is the button: no separate Play
// control, just the hover lift and accent ring that mark it as clickable. It
// is a real <button>, so it works from the keyboard, and the aria-label says
// what it does. `data-card-key` lets the library screen find where keyboard
// focus was when a card moves between sections.
//
// aria-disabled, not the disabled attribute, while busy: a disabled button
// drops keyboard focus (and its focus ring) in the middle of a launch.
function GameTile({
  card,
  kind,
  showBadge,
  coverRetryToken,
  busy,
  active,
  onStart
}: GameTileProps): React.JSX.Element {
  const pausedClasses = active ? 'cursor-wait opacity-60' : busy ? 'cursor-default opacity-60' : ''
  const storeName = STORES.find((store) => store.id === card.store)?.name ?? card.store
  const action = kind === 'launch' ? 'Play' : 'Install'
  return (
    <button
      type="button"
      data-card-key={card.key}
      onClick={() => {
        if (!busy) onStart()
      }}
      aria-disabled={busy}
      aria-label={`${action} ${card.title}`}
      className={`group flex w-full min-w-0 flex-col gap-1 text-left focus-visible:outline-none ${pausedClasses}`}
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
  )
}

export default GameTile
