import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc/updates-channels'
import { SWITCH_NOT_SAVED, sidebarNotice, type SidebarNotice } from './update-messages'

export interface Updates {
  // null until main's status has been read once.
  status: UpdateStatus | null
  // The sidebar notice, or null (Later counted in).
  notice: SidebarNotice | null
  // true while Check now waits for its answer.
  checking: boolean
  // true while the switch's new value is being saved.
  savingSwitch: boolean
  // The switch's problem line, or null.
  switchProblem: string | null
  checkNow: () => void
  download: () => void
  restart: () => void
  // Hides the offer of this version until the app restarts.
  later: (version: string) => void
  setEnabled: (enabled: boolean) => void
}

// The updater's state for the whole app (docs/features/release.md, section
// 4), held at the top so the sidebar notice and Settings always agree. Main
// holds the one real state; this only shows it.
//
// The latest answer wins, with no request numbers, because of two things
// main guarantees (keep both if this changes):
// - every answer is main's whole status, built in the same step that sends
//   it, never read earlier and sent later;
// - the change notice carries no status, it only makes the window ask.
// Answers and notices reach the window in the order main sent them, so the
// last answer is always the newest state.
export function useUpdates(): Updates {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [laterVersion, setLaterVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [savingSwitch, setSavingSwitch] = useState(false)
  const [switchProblem, setSwitchProblem] = useState<string | null>(null)

  const reload = useCallback(() => {
    // A failed read keeps what is shown; the next change notice reads again.
    window.api.updates.getStatus().then(setStatus, () => undefined)
  }, [])

  useEffect(() => {
    reload()
    // Only a read follows a notice: main does no work on getStatus, so this
    // can't turn into a notify → read → notify loop.
    return window.api.updates.onStatusChanged(reload)
  }, [reload])

  const checkNow = useCallback(() => {
    setChecking(true)
    window.api.updates
      .checkNow()
      .then(({ status: next }) => setStatus(next), reload)
      .finally(() => setChecking(false))
  }, [reload])

  const download = useCallback(() => {
    window.api.updates.download().then(({ accepted, status: next }) => {
      // A download the user started undoes Later for its version, so if it
      // fails the sidebar offers Download again.
      if (accepted && next.state.kind === 'downloading') {
        const started = next.state.version
        setLaterVersion((later) => (later === started ? null : later))
      }
      setStatus(next)
    }, reload)
  }, [reload])

  const restart = useCallback(() => {
    window.api.updates.restartAndInstall().then(({ status: next }) => setStatus(next), reload)
  }, [reload])

  const later = useCallback((version: string) => setLaterVersion(version), [])

  const setEnabled = useCallback(
    (enabled: boolean) => {
      setSavingSwitch(true)
      setSwitchProblem(null)
      window.api.updates
        .setEnabled(enabled)
        .then(
          ({ saved, status: next }) => {
            setStatus(next)
            if (!saved) setSwitchProblem(SWITCH_NOT_SAVED)
          },
          () => {
            setSwitchProblem(SWITCH_NOT_SAVED)
            reload()
          }
        )
        .finally(() => setSavingSwitch(false))
    },
    [reload]
  )

  return {
    status,
    notice: sidebarNotice(status, laterVersion),
    checking,
    savingSwitch,
    switchProblem,
    checkNow,
    download,
    restart,
    later,
    setEnabled
  }
}
