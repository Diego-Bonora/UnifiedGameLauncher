import { useCallback, useEffect, useRef, useState } from 'react'
import type { ManualChangeResult, ManualGameView } from '@shared/ipc/manual-channels'
import type { ManualMenuAction } from './ManualGameMenu'
import type { ManualFormMode, ManualFormValues } from './ManualGameDialogs'
import {
  BUSY_MESSAGE,
  changeFailed,
  changeSucceeded,
  pickMessage,
  type ChangeOutcome,
  type ManualAction,
  type ManualMessage
} from './manual-messages'
import type { ManualGames } from './use-manual-games'

// What is open: a form (with its starting values) or the Remove question.
export type ManualDialog =
  | { kind: 'form'; mode: ManualFormMode; game: ManualGameView | null; initial: ManualFormValues }
  | { kind: 'remove'; game: ManualGameView }

export interface ManualActions {
  dialog: ManualDialog | null
  // A save or a file picker is running.
  busy: boolean
  // A problem the user can fix in the open form.
  formProblem: ManualMessage | null
  // The app's message line for manual games.
  message: ManualMessage | null
  startAdd: (opener: HTMLElement | null) => void
  fromMenu: (action: ManualMenuAction, game: ManualGameView, opener: HTMLElement | null) => void
  save: (values: ManualFormValues) => void
  confirmRemove: () => void
  cancel: () => void
}

// How long after one of main's own windows (file picker, confirmation)
// closes the window's focus event is still taken as that window closing, not
// as the user coming back to the app.
const NATIVE_DIALOG_FOCUS_GRACE_MS = 1000

function outcomeOf(
  action: ManualAction,
  title: string,
  result: ManualChangeResult | 'failed'
): ChangeOutcome {
  if (result === 'failed') return changeFailed(action, 'failed', title)
  return result.saved ? changeSucceeded(action, title) : changeFailed(action, result.reason, title)
}

// Adding and editing manual games (docs/features/library-tools.md, "Adding a
// game" and "Editing"), for the whole app. `fallbackFocus` is where focus
// goes when what opened a dialog or menu is gone (a removed game's ⋯ button).
export function useManualActions(manual: ManualGames, fallbackFocus: () => void): ManualActions {
  const [dialog, setDialog] = useState<ManualDialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [formProblem, setFormProblem] = useState<ManualMessage | null>(null)
  const [message, setMessage] = useState<ManualMessage | null>(null)
  // State lags a render: a second click must see the first one at once.
  const busyRef = useRef(false)
  const lastNativeDialogEndRef = useRef(0)
  // Where focus goes back to once the dialog is gone (or Change .exe ends).
  const openerRef = useRef<HTMLElement | null>(null)
  const [restoreFocus, setRestoreFocus] = useState(0)
  const fallbackFocusRef = useRef(fallbackFocus)
  useEffect(() => {
    fallbackFocusRef.current = fallbackFocus
  }, [fallbackFocus])

  useEffect(() => {
    // Like the other problem lines: coming back to the window clears an old
    // problem, which may no longer be true. Not the focus that comes back
    // when main's own file picker or confirmation closes: that is the moment
    // its result (often a problem) is shown.
    const handleFocus = (): void => {
      if (busyRef.current) return
      if (Date.now() - lastNativeDialogEndRef.current < NATIVE_DIALOG_FOCUS_GRACE_MS) return
      setMessage((current) => (current?.tone === 'danger' ? null : current))
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Runs after React has removed the dialog (its own cleanup has closed the
  // <dialog>), so the opener is no longer behind a modal and can take focus.
  useEffect(() => {
    if (restoreFocus === 0 || dialog !== null) return
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
    else fallbackFocusRef.current()
  }, [restoreFocus, dialog])

  const close = useCallback(() => {
    setDialog(null)
    setFormProblem(null)
    setRestoreFocus((count) => count + 1)
  }, [])

  // One action at a time. A click while one runs says so, rather than
  // silently doing nothing.
  const run = useCallback(async (task: () => Promise<void>): Promise<void> => {
    if (busyRef.current) {
      setMessage({ text: BUSY_MESSAGE, tone: 'danger' })
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      await task()
    } finally {
      busyRef.current = false
      setBusy(false)
      lastNativeDialogEndRef.current = Date.now()
    }
  }, [])

  // Applies a change's result to the form and the message line (the list
  // itself is applied by manual.change).
  const finish = useCallback(
    (action: ManualAction, title: string, result: ManualChangeResult | 'failed'): void => {
      const outcome = outcomeOf(action, title, result)
      if (outcome.stayOpen) {
        setFormProblem(outcome.message)
        return
      }
      // An Add form closing without a save: main can let go of the pick.
      if (action === 'add' && (result === 'failed' || !result.saved)) {
        window.api.manual.cancelAdd().catch(() => undefined)
      }
      setMessage(outcome.message)
      close()
    },
    [close]
  )

  const startAdd = useCallback(
    (opener: HTMLElement | null) => {
      setMessage(null)
      void run(async () => {
        let result
        try {
          result = await window.api.manual.pickExe()
        } catch {
          setMessage(changeFailed('add', 'failed', '').message)
          return
        }
        if (result.picked) {
          openerRef.current = opener
          setFormProblem(null)
          setDialog({
            kind: 'form',
            mode: 'add',
            game: null,
            initial: { title: result.suggestedTitle, args: '' }
          })
        } else {
          setMessage(pickMessage(result))
        }
      })
    },
    [run]
  )

  const changeExe = useCallback(
    (game: ManualGameView, opener: HTMLElement | null) => {
      setMessage(null)
      void run(async () => {
        const result = await manual.change(() => window.api.manual.changeExe(game.id))
        setMessage(outcomeOf('changeExe', game.title, result).message)
        // The menu item that started it is gone; back to the ⋯ button.
        openerRef.current = opener
        setRestoreFocus((count) => count + 1)
      })
    },
    [manual, run]
  )

  const fromMenu = useCallback(
    (action: ManualMenuAction, game: ManualGameView, opener: HTMLElement | null) => {
      if (busyRef.current) {
        setMessage({ text: BUSY_MESSAGE, tone: 'danger' })
        opener?.focus()
        return
      }
      switch (action) {
        case 'changeExe':
          changeExe(game, opener)
          return
        case 'remove':
          setMessage(null)
          setFormProblem(null)
          openerRef.current = opener
          setDialog({ kind: 'remove', game })
          return
        case 'rename':
        case 'args':
          setMessage(null)
          setFormProblem(null)
          openerRef.current = opener
          setDialog({
            kind: 'form',
            mode: action,
            game,
            initial: { title: game.title, args: game.args }
          })
          return
      }
    },
    [changeExe]
  )

  const save = useCallback(
    (values: ManualFormValues) => {
      const open = dialog
      if (open?.kind !== 'form') return
      setFormProblem(null)
      void run(async () => {
        const { mode, game } = open
        if (mode === 'add') {
          const result = await manual.change(() => window.api.manual.add(values.title, values.args))
          finish('add', values.title, result)
        } else if (game !== null && mode === 'rename') {
          const result = await manual.change(() => window.api.manual.rename(game.id, values.title))
          finish('rename', values.title, result)
        } else if (game !== null) {
          const result = await manual.change(() => window.api.manual.setArgs(game.id, values.args))
          finish('args', game.title, result)
        }
      })
    },
    [dialog, finish, manual, run]
  )

  const confirmRemove = useCallback(() => {
    const open = dialog
    if (open?.kind !== 'remove') return
    void run(async () => {
      const result = await manual.change(() => window.api.manual.remove(open.game.id))
      finish('remove', open.game.title, result)
    })
  }, [dialog, finish, manual, run])

  const cancel = useCallback(() => {
    // While a save runs (main's confirmation window may be open) the form
    // stays: its result is about to arrive and decides what happens.
    if (busyRef.current) return
    // Main keeps the picked path until add or cancelAdd: let it go.
    if (dialog?.kind === 'form' && dialog.mode === 'add') {
      window.api.manual.cancelAdd().catch(() => undefined)
    }
    close()
  }, [close, dialog])

  return {
    dialog,
    busy,
    formProblem,
    message,
    startAdd,
    fromMenu,
    save,
    confirmRemove,
    cancel
  }
}
