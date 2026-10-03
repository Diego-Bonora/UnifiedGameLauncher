import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameCard } from './game-cards'

export const FAVORITE_SAVE_PROBLEM = "Couldn't save your favorite. Try again."

export interface Favorites {
  // Starred card keys (`<store>:<id>`).
  keys: ReadonlySet<string>
  toggle: (card: GameCard) => void
  // The save problem line, or null.
  problem: string | null
}

// Starred games for the whole app (docs/features/library-tools.md,
// "Favorites"). Held at the top like the other app-wide state, so a star made
// in one view shows in every view.
//
// A click flips the star at once. Main answers every save with what it has
// really saved, and the newest answer wins: main saves one request at a time,
// in order, so its answer to the latest request already includes every
// earlier one. Answers to older requests are ignored (except to report a
// failure), so a slow early answer can't undo a later click.
export function useFavorites(): Favorites {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [problem, setProblem] = useState<string | null>(null)
  // The current keys for toggle, which must not wait for a re-render: two
  // fast clicks on one star must flip it twice, not set it twice.
  const keysRef = useRef<ReadonlySet<string>>(keys)
  // Number of the newest request sent to main; only its answer is applied.
  const latestRef = useRef(0)

  const show = useCallback((next: ReadonlySet<string>) => {
    keysRef.current = next
    setKeys(next)
  }, [])

  // Re-reads what main has saved, for when a save's answer never came back.
  const resync = useCallback(() => {
    const request = ++latestRef.current
    window.api.favorites
      .list()
      .then((list) => {
        if (request === latestRef.current) show(new Set(list))
      })
      .catch(() => undefined)
  }, [show])

  useEffect(() => {
    resync()
    // Coming back to the window clears an old problem, like a launch problem.
    const handleFocus = (): void => setProblem(null)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [resync])

  const toggle = useCallback(
    (card: GameCard) => {
      const favorite = !keysRef.current.has(card.key)
      const optimistic = new Set(keysRef.current)
      if (favorite) optimistic.add(card.key)
      else optimistic.delete(card.key)
      show(optimistic)
      setProblem(null)

      const request = ++latestRef.current
      window.api.favorites
        .set(card.store, card.id, favorite)
        .then((result) => {
          if (!result.saved) setProblem(FAVORITE_SAVE_PROBLEM)
          if (request === latestRef.current) show(new Set(result.keys))
        })
        .catch(() => {
          // Only a malformed request or a broken IPC gets here: the real
          // state is unknown, so ask main for it.
          setProblem(FAVORITE_SAVE_PROBLEM)
          if (request === latestRef.current) resync()
        })
    },
    [resync, show]
  )

  return { keys, toggle, problem }
}
