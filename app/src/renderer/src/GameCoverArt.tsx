import { useState } from 'react'

interface GameCoverArtProps {
  coverUrl: string | null
}

// coverUrl is already resolved (main looked it up via Steam's store-browse
// API — see main/stores/steam/library-cover-art.ts) — this component just
// renders it, or a placeholder when there is none or it fails to load.
function GameCoverArt({ coverUrl }: GameCoverArtProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  if (coverUrl === null || failed) {
    return <div className="aspect-[2/3] w-full rounded-card bg-surface-2" />
  }

  return (
    <img
      src={coverUrl}
      alt=""
      loading="lazy"
      className="aspect-[2/3] w-full rounded-card bg-surface-2 object-cover ring-1 ring-border transition-transform duration-150 hover:-translate-y-1 hover:ring-2 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onError={() => setFailed(true)}
    />
  )
}

export default GameCoverArt
