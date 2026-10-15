import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManualGamesList } from '@shared/ipc/manual-channels'
import { nextManualList } from './manual-view'

export interface ManualGames {
  // false until the first read has answered (or failed).
  loaded: boolean
  list: ManualGamesList
  // See GameCoverArt: changes whenever main says covers changed, so a cover
  // that failed to load gets another try.
  coverRetryToken: number
  reload: () => void
  // Sends a change and shows the list main answers with, unless a newer
  // change was started. If a read was started while it ran (a covers notice
  // reloads the list in the background), that read may hold the list from
  // before the save, so the list is also read again. 'failed' when the call
  // itself broke (main never intends that); the list is then read again too.
  change: <T extends { list: ManualGamesList }>(call: () => Promise<T>) => Promise<T | 'failed'>
}

const EMPTY: ManualGamesList = { readable: true, coversReadable: true, games: [] }

// The manual games for the whole app (docs/features/library-tools.md),
// held at the top like the Steam and Epic lists. Main's answer to the newest
// request wins: an older read can't put back a game a newer change removed.
export function useManualGames(): ManualGames {
  const [loaded, setLoaded] = useState(false)
  const [list, setList] = useState<ManualGamesList>(EMPTY)
  const [coverRetryToken, setCoverRetryToken] = useState(0)
  // Every read and change gets a number; an answer is shown only if nothing
  // newer was started. A change also has its own count: its answer is the
  // saved state, so only a newer change may hide it, not a read.
  const latestRef = useRef(0)
  const latestChangeRef = useRef(0)

  const reload = useCallback(() => {
    const request = ++latestRef.current
    window.api.manual
      .list()
      .then((next) => {
        if (request !== latestRef.current) return
        setList((current) => nextManualList(current, next))
        setLoaded(true)
      })
      .catch(() => {
        if (request !== latestRef.current) return
        // Can't tell what is saved: treated like an unreadable file (the
        // notice and Try again show, adding and editing are off), keeping
        // the games already shown. Never "no manual games yet".
        setList((current) => ({ ...current, readable: false }))
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Main saved or removed a poster or icon in the background (after an add,
  // a rename, a cover switch or at startup): read the list for the new URLs.
  // Main tries each cover at most once per session, so this reload (which
  // lets main look again) can't turn into a loop.
  useEffect(
    () =>
      window.api.manual.onCoversChanged(() => {
        setCoverRetryToken((token) => token + 1)
        reload()
      }),
    [reload]
  )

  const change = useCallback(
    async <T extends { list: ManualGamesList }>(call: () => Promise<T>): Promise<T | 'failed'> => {
      const request = ++latestRef.current
      const changeRequest = ++latestChangeRef.current
      try {
        const result = await call()
        if (changeRequest === latestChangeRef.current) {
          // Shown at once, so the dialog closing, its message and the card
          // agree (a removed game's card is gone when focus moves on).
          setList((current) => nextManualList(current, result.list))
          setLoaded(true)
        }
        if (request !== latestRef.current) {
          // A read started while this change waited (say, on main's
          // confirmation window) may hold the list from before the save.
          // Read again: this read starts after the save, and it also makes
          // that older read's answer, if it hasn't come yet, too old to show.
          reload()
        }
        return result
      } catch {
        // Read again (which also ends the skeletons, if this change
        // overtook the first read). Always, even when overtaken: the newer
        // read may have been answered before this change did anything.
        reload()
        return 'failed'
      }
    },
    [reload]
  )

  return { loaded, list, coverRetryToken, reload, change }
}
