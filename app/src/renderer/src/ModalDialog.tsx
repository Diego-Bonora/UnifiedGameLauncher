import { useEffect, useId, useRef } from 'react'

interface ModalDialogProps {
  title: string
  // 'alertdialog' for a question that needs an answer (Remove).
  role?: 'dialog' | 'alertdialog'
  // Esc, or the Cancel button inside.
  onCancel: () => void
  children: React.ReactNode
  // Where focus goes when the dialog opens (a field, or Cancel for Remove).
  initialFocusRef?: React.RefObject<HTMLElement | null>
  // Optional text under the title, read out with it.
  description?: string
}

// A modal window inside the app, built on the browser's own <dialog>: shown
// with showModal(), it keeps Tab inside itself, makes the page behind it
// inert, and closes on Esc, with nothing hand-rolled. It is only rendered
// while open, so "a dialog is open" is simply "one is in the page" (Ctrl+F
// relies on that, see LibraryScreen). Focus going back to whatever opened it
// is the caller's job: only the caller knows whether that still exists.
// m-auto puts back the browser's centring, which Tailwind's base styles reset.
function ModalDialog({
  title,
  role = 'dialog',
  onCancel,
  children,
  initialFocusRef,
  description
}: ModalDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) dialog.showModal()
    initialFocusRef?.current?.focus()
    // Esc fires "cancel"; the browser would close the dialog itself, but the
    // caller owns whether it is shown, so it decides.
    const handleCancel = (event: Event): void => {
      event.preventDefault()
      onCancelRef.current()
    }
    // Chromium lets a page refuse Esc only once without a click in between;
    // a second Esc closes the <dialog> anyway. While the caller still shows
    // it, open it again and treat that Esc as a Cancel, so what is on screen
    // never disagrees with the app's state.
    let unmounting = false
    const handleClose = (): void => {
      // `open` is checked too: a close event can arrive late, after the
      // dialog was opened again (React's development double run of effects
      // closes and reopens it), and must not cancel the reopened one.
      if (unmounting || dialog.open) return
      dialog.showModal()
      onCancelRef.current()
    }
    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('close', handleClose)
    return () => {
      unmounting = true
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('close', handleClose)
      if (dialog.open) dialog.close()
    }
  }, [initialFocusRef])

  return (
    <dialog
      ref={dialogRef}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      className="m-auto w-[calc(100%-32px)] max-w-60 rounded-card border border-border bg-surface p-3 text-text shadow-2xl backdrop:bg-background/70"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {description !== undefined && (
        <p id={descriptionId} className="mt-1 text-sm text-muted">
          {description}
        </p>
      )}
      <div className="mt-2">{children}</div>
    </dialog>
  )
}

export default ModalDialog
