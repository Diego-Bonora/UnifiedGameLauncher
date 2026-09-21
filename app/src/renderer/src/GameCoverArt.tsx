import { useState } from 'react'

interface GameCoverArtProps {
  coverUrl: string | null
}

// coverUrl is already resolved (main looked it up via Steam's store-browse
// API — see main/stores/steam/library-cover-art.ts) — this component just
// renders it, or a placeholder when there is none or it fails to load.
function GameCoverArt({ coverUrl }: GameCoverArtProps): React.JSX.Element {
  // The URL that failed, not just "something failed": when the cover later
  // changes (a remote URL that failed offline being replaced by the local copy
  // once it is downloaded), the new URL must get its own chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (coverUrl === null || failedUrl === coverUrl) {
    return <div className="aspect-[2/3] w-full rounded-card bg-surface-2" />
  }

  return (
    <img
      src={coverUrl}
      alt=""
      loading="lazy"
      className="aspect-[2/3] w-full rounded-card bg-surface-2 object-cover ring-1 ring-border transition-transform duration-150 hover:-translate-y-1 hover:ring-2 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onError={() => setFailedUrl(coverUrl)}
    />
  )
}

export default GameCoverArt
