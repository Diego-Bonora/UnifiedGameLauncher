import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreId } from '@shared/stores'
import type { GameCard } from './game-cards'
import {
  HAND_OFF_PAUSE_MS,
  handOffFeedback,
  type HandOffKind,
  type HandOffOutcome
} from './hand-off'

export interface HandOffMessage {
  message: string
  tone: 'info' | 'danger'
}

export interface HandOff {
  // The card being launched or installed, while every card is paused.
  activeKey: string | null
  // The one message line for the whole app, shown in whatever view is open.
  feedback: HandOffMessage | null
  start: (card: GameCard, kind: HandOffKind) => void
}

// A rejection here becomes the friendly 'failed' message, never raw text.
function callStore(card: GameCard, kind: HandOffKind): Promise<HandOffOutcome> {
  switch (card.store) {
    case 'steam':
      return kind === 'launch'
        ? window.api.steam.launch(card.id)
        : window.api.steam.install(card.id)
    case 'epic':
      // Epic has no install (no owned-not-installed games); refused rather
      // than quietly launching instead.
      if (kind === 'install') return Promise.reject(new Error('Epic has no install'))
      return window.api.epic.launch(card.id)
    case 'manual':
      // Always installed: there is nothing to install.
      if (kind === 'install') return Promise.reject(new Error('Manual games have no install'))
      return window.api.manual.launch(card.id)
    default: {
      // A store added to shared/stores.ts doesn't compile until it is
      // handled here, instead of falling through to another store's launcher.
      const unhandled: never = card.store
      return Promise.reject(new Error(`No launcher for ${String(unhandled)}`))
    }
  }
}

// One pause and one message line for the whole app (spec: "Pause"). Held at
// the top, not by a view, so a launch started in one view still pauses the
// cards in every other one, and switching views can't end the pause early.
// `onListStale` is told when a store's installed list turned out to be out of
// date (an Epic game uninstalled since the last read).
export function useHandOff(onListStale: (store: StoreId) => void): HandOff {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<HandOffMessage | null>(null)
  // State lags a render behind; a fast double click must not start twice.
  const busyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onListStaleRef = useRef(onListStale)
  useEffect(() => {
    onListStaleRef.current = onListStale
  }, [onListStale])

  useEffect(() => {
    // Coming back to the window clears an old problem message: it may no
    // longer be true. Progress lines go away on their own.
    const handleFocus = (): void => {
      setFeedback((current) => (current?.tone === 'danger' ? null : current))
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      // Ends a running pause too: without its timer nothing else would, and
      // a dev hot reload (which keeps state and refs) would leave every card
      // paused until a full reload.
      clearTimeout(timerRef.current)
      busyRef.current = false
      setActiveKey(null)
    }
  }, [])

  const finish = useCallback((card: GameCard, kind: HandOffKind, outcome: HandOffOutcome) => {
    const result = handOffFeedback(card, kind, outcome)
    setFeedback({ message: result.message, tone: result.tone })
    if (result.refreshList) onListStaleRef.current(card.store)

    if (result.tone === 'danger') {
      // Nothing started, so the cards are free again straight away.
      busyRef.current = false
      setActiveKey(null)
      return
    }
    timerRef.current = setTimeout(() => {
      busyRef.current = false
      setActiveKey(null)
      // Only the progress line goes away on its own; a problem must stay.
      setFeedback((current) => (current?.tone === 'info' ? null : current))
    }, HAND_OFF_PAUSE_MS)
  }, [])

  const start = useCallback(
    (card: GameCard, kind: HandOffKind) => {
      // Cards are aria-disabled while paused, which (unlike the disabled
      // attribute) keeps keyboard focus but doesn't block clicks.
      if (busyRef.current) return
      busyRef.current = true
      setFeedback(null)
      setActiveKey(card.key)
      callStore(card, kind)
        .then((outcome) => finish(card, kind, outcome))
        .catch(() => finish(card, kind, 'failed'))
    },
    [finish]
  )

  return { activeKey, feedback, start }
}
