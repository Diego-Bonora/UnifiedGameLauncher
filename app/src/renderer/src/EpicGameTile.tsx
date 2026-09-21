import GameCoverArt from './GameCoverArt'

interface EpicGameTileProps {
  title: string
  // Epic has no cover art yet (that needs the owned-library stage, which
  // needs a login). The prop is here so tiles don't change shape when it
  // arrives: pass the URL instead of null.
  coverUrl: string | null
  // Some launch is in progress: every tile pauses, not just the one clicked.
  busy: boolean
  // This tile is the one being launched.
  launching: boolean
  onPlay: () => void
}

// One installed game as a poster tile. The whole tile is the play button: no
// separate Play control, just the hover lift and accent ring that mark it as
// clickable. It is a real <button>, so it is reachable and activatable from the
// keyboard, and the aria-label tells screen readers what it does.
//
// aria-disabled, not the disabled attribute, while busy: a disabled button
// drops keyboard focus (and its focus ring) in the middle of a launch.
function EpicGameTile({
  title,
  coverUrl,
  busy,
  launching,
  onPlay
}: EpicGameTileProps): React.JSX.Element {
  const pausedClasses = launching
    ? 'cursor-wait opacity-60'
    : busy
      ? 'cursor-default opacity-60'
      : ''
  return (
    <button
      type="button"
      onClick={() => {
        if (!busy) onPlay()
      }}
      aria-disabled={busy}
      aria-label={`Play ${title}`}
      className={`group flex w-full min-w-0 flex-col gap-2 text-left focus-visible:outline-none ${pausedClasses}`}
    >
      <div className="relative">
        <GameCoverArt coverUrl={coverUrl} placeholderLabel={title} />
        {/* Decorative: the button's own label says what it does. Lifts with the
            cover (same distance and timing) so it stays put on the poster. */}
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 rounded-full bg-background/80 px-1 text-xs text-muted transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:-translate-y-1"
        >
          Epic
        </span>
      </div>
      <span className="truncate text-sm text-muted">{title}</span>
    </button>
  )
}

export default EpicGameTile
