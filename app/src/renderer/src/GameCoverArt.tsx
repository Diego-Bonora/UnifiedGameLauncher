import { useState } from 'react'

interface GameCoverArtProps {
  coverUrl: string | null
  // When set, the placeholder (no cover, or one that failed to load) shows this
  // text and gets the same ring and hover lift as a real cover. For tiles whose
  // cover art isn't available yet, where the title is the only way to tell
  // them apart. Without it the placeholder stays a plain block.
  placeholderLabel?: string
  // A failure only counts for the token it happened under, so a cover whose
  // URL never changes can still recover from one failed load. Epic's token
  // changes on every list read, Steam's whenever new covers are saved.
  retryToken?: number
}

// coverUrl is already resolved (main looked it up via Steam's store-browse
// API — see main/stores/steam/library-cover-art.ts) — this component just
// renders it, or a placeholder when there is none or it fails to load.
function GameCoverArt({
  coverUrl,
  placeholderLabel,
  retryToken
}: GameCoverArtProps): React.JSX.Element {
  // The URL that failed, not just "something failed": when the cover later
  // changes (a remote URL that failed offline being replaced by the local copy
  // once it is downloaded), the new URL must get its own chance. Same for a
  // new retry token.
  const [failed, setFailed] = useState<{ url: string; token: number | undefined } | null>(null)
  const hasFailed = failed !== null && failed.url === coverUrl && failed.token === retryToken

  if (coverUrl === null || hasFailed) {
    if (placeholderLabel === undefined) {
      return <div className="aspect-[2/3] w-full rounded-card bg-surface-2" />
    }
    return (
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded-card bg-surface-2 p-2 text-center ring-1 ring-border transition-transform duration-150 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-accent group-focus-visible:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <span className="line-clamp-4 font-display text-sm font-semibold text-muted">
          {placeholderLabel}
        </span>
      </div>
    )
  }

  return (
    <img
      src={coverUrl}
      alt=""
      loading="lazy"
      className="aspect-[2/3] w-full rounded-card bg-surface-2 object-cover ring-1 ring-border transition-transform duration-150 hover:-translate-y-1 hover:ring-2 hover:ring-accent group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-accent group-focus-visible:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onError={() => setFailed({ url: coverUrl, token: retryToken })}
    />
  )
}

export default GameCoverArt
