interface GameSectionProps {
  id: string
  title: string
  // Skeleton posters while the first read is still running.
  loading: boolean
  // Shown above the grid (notices, Try again, Open Settings).
  notices?: React.ReactNode
  // Shown instead of the grid when there are no cards; null for nothing.
  empty: React.ReactNode
  hasCards: boolean
  children: React.ReactNode
  headingRef: React.Ref<HTMLHeadingElement>
}

// The grid uses the whole width of the content area: as many columns of at
// least ~160 px as fit, added and removed as the window resizes. Spacing is the
// project's 8 px scale (gap-3 = 24 px).
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3'

// One Installed or Library section. The heading takes focus (tabIndex -1)
// when a focused card moves out from under the keyboard, hence headingRef.
function GameSection({
  id,
  title,
  loading,
  notices,
  empty,
  hasCards,
  children,
  headingRef
}: GameSectionProps): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2
        id={id}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold focus:outline-none"
      >
        {title}
      </h2>
      {notices}
      {loading ? (
        <div className={GRID} aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="aspect-[2/3] animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : hasCards ? (
        <ul className={GRID}>{children}</ul>
      ) : (
        empty
      )}
    </section>
  )
}

export default GameSection
