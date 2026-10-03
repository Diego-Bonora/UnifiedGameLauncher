import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManualGamesList } from '@shared/ipc/manual-channels'

export interface ManualGames {
  // false until the first read has answered (or failed).
  loaded: boolean
  list: ManualGamesList
  reload: () => void
  // Sends a change and shows the list main answers with, unless a newer read
  // or change has answered since. 'failed' when the call itself broke (main
  // never intends that); the list is then read again.
  change: <T extends { list: ManualGamesList }>(call: () => Promise<T>) => Promise<T | 'failed'>
}

const EMPTY: ManualGamesList = { readable: true, games: [] }

// The manual games for the whole app (docs/features/library-tools.md),
// held at the top like the Steam and Epic lists. Main's answer to the newest
// request wins: an older read can't put back a game a newer change removed.
export function useManualGames(): ManualGames {
  const [loaded, setLoaded] = useState(false)
  const [list, setList] = useState<ManualGamesList>(EMPTY)
  const latestRef = useRef(0)

  const reload = useCallback(() => {
    const request = ++latestRef.current
    window.api.manual
      .list()
      .then((next) => {
        if (request !== latestRef.current) return
        setList(next)
        setLoaded(true)
      })
      .catch(() => {
        if (request !== latestRef.current) return
        // Can't tell what is saved: treated like an unreadable file (the
        // notice and Try again show, adding and editing are off), keeping
        // the games already shown. Never "no manual games yet".
        setList((current) => ({ readable: false, games: current.games }))
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const change = useCallback(
    async <T extends { list: ManualGamesList }>(call: () => Promise<T>): Promise<T | 'failed'> => {
      const request = ++latestRef.current
      try {
        const result = await call()
        if (request === latestRef.current) {
          setList(result.list)
          setLoaded(true)
        }
        return result
      } catch {
        // Read again (which also ends the skeletons, if this change
        // overtook the first read).
        if (request === latestRef.current) reload()
        return 'failed'
      }
    },
    [reload]
  )

  return { loaded, list, reload, change }
}
