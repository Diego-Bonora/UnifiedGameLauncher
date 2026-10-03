import EpicGameTile from './EpicGameTile'
import type { GameCard } from './game-cards'
import type { EpicLibrary } from './use-epic-library'
import type { HandOff } from './use-hand-off'

interface EpicInstalledSectionProps {
  epic: EpicLibrary
  // The Epic view's Installed cards, already sorted.
  cards: GameCard[]
  handOff: HandOff
}

// Shows the Epic list. The list and the launch pause live in app-wide hooks,
// so this only draws them; the key form is on the Settings screen. The
// Installed/Library grid replaces this next.
function EpicInstalledSection({
  epic,
  cards,
  handOff
}: EpicInstalledSectionProps): React.JSX.Element {
  const { loaded } = epic
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">Epic Games</h2>
      {!loaded && (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4"
          aria-busy="true"
        >
          {[0, 1, 2].map((key) => (
            <div key={key} className="aspect-[2/3] animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}
      {loaded && cards.length === 0 && (
        <p className="text-muted">No Epic games installed on this PC.</p>
      )}
      {loaded && cards.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {cards.map((card) => (
            <li key={card.key} className="min-w-0">
              <EpicGameTile
                title={card.title}
                coverUrl={card.coverUrl}
                coverRetryToken={epic.coverRetryToken}
                busy={handOff.activeKey !== null}
                launching={handOff.activeKey === card.key}
                onPlay={() => handOff.start(card, 'launch')}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EpicInstalledSection
