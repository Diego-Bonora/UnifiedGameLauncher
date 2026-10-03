import { useId, useRef, useState } from 'react'
import { MAX_ARGS_LENGTH, MAX_TITLE_LENGTH } from '@shared/ipc/manual-channels'
import ModalDialog from './ModalDialog'
import { argsProblem, titleProblem, type ManualMessage } from './manual-messages'

const BUTTON =
  'rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-disabled:opacity-60'
const PRIMARY =
  'rounded-control bg-accent px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-disabled:opacity-60'
const DANGER =
  'rounded-control bg-danger px-3 py-1 text-sm font-medium text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-disabled:opacity-60'
const INPUT =
  'w-full rounded-control border border-border bg-background px-2 py-1 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:border-danger'

export type ManualFormMode = 'add' | 'rename' | 'args'

export interface ManualFormValues {
  title: string
  args: string
}

interface ManualGameFormDialogProps {
  mode: ManualFormMode
  initial: ManualFormValues
  // The game's current title, for the dialog heading (rename and args).
  gameTitle?: string
  // A save is running: the buttons wait, so it can't be sent twice.
  busy: boolean
  // A problem from main that the user can fix here (shown in the form).
  problem: ManualMessage | null
  onSave: (values: ManualFormValues) => void
  onCancel: () => void
}

const HEADINGS: Record<ManualFormMode, (title: string) => string> = {
  add: () => 'Add a game',
  rename: (title) => `Rename ${title}`,
  args: (title) => `Launch arguments for ${title}`
}

// The Add game form (title and arguments), and the Rename and Launch
// arguments forms from a card's ⋯ menu (docs/features/library-tools.md).
// The fields are checked with the same rules main uses before anything is
// sent; main checks again, and asks its own confirmation for new arguments.
export function ManualGameFormDialog({
  mode,
  initial,
  gameTitle = '',
  busy,
  problem,
  onSave,
  onCancel
}: ManualGameFormDialogProps): React.JSX.Element {
  const [title, setTitle] = useState(initial.title)
  const [args, setArgs] = useState(initial.args)
  // Field problems show after the first Save, then follow the typing.
  const [checked, setChecked] = useState(false)
  const showsTitle = mode !== 'args'
  const showsArgs = mode !== 'rename'
  const titleError = showsTitle && checked ? titleProblem(title) : null
  const argsError = showsArgs && checked ? argsProblem(args) : null
  const titleRef = useRef<HTMLInputElement>(null)
  const argsRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const argsId = useId()
  const titleErrorId = useId()
  const argsErrorId = useId()
  const argsHelpId = useId()

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (busy) return
    setChecked(true)
    // To the first field that needs fixing; its message is announced (alert).
    if (showsTitle && titleProblem(title) !== null) {
      titleRef.current?.focus()
      return
    }
    if (showsArgs && argsProblem(args) !== null) {
      argsRef.current?.focus()
      return
    }
    onSave({ title: title.trim(), args: args.trim() })
  }

  return (
    <ModalDialog
      title={HEADINGS[mode](gameTitle)}
      onCancel={onCancel}
      initialFocusRef={showsTitle ? titleRef : argsRef}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        {showsTitle && (
          <div className="flex flex-col gap-0.5">
            <label htmlFor={titleId} className="text-sm font-medium">
              Title
            </label>
            <input
              ref={titleRef}
              id={titleId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE_LENGTH * 2}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={titleError !== null}
              aria-describedby={titleError === null ? undefined : titleErrorId}
              className={INPUT}
            />
            {titleError !== null && (
              <p id={titleErrorId} role="alert" className="text-sm text-danger">
                {titleError}
              </p>
            )}
          </div>
        )}
        {showsArgs && (
          <div className="flex flex-col gap-0.5">
            <label htmlFor={argsId} className="text-sm font-medium">
              Launch arguments <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              ref={argsRef}
              id={argsId}
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              maxLength={MAX_ARGS_LENGTH * 2}
              autoComplete="off"
              spellCheck={false}
              placeholder="For example: -windowed"
              aria-invalid={argsError !== null}
              aria-describedby={`${argsHelpId}${argsError === null ? '' : ` ${argsErrorId}`}`}
              className={`${INPUT} font-mono`}
            />
            <p id={argsHelpId} className="text-xs text-muted">
              Passed to the game exactly as typed. New arguments are confirmed in a Windows window
              before they&apos;re saved.
            </p>
            {argsError !== null && (
              <p id={argsErrorId} role="alert" className="text-sm text-danger">
                {argsError}
              </p>
            )}
          </div>
        )}
        {problem !== null && (
          <p role="alert" className={problem.tone === 'danger' ? 'text-sm text-danger' : 'text-sm'}>
            {problem.text}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-1">
          {/* aria-disabled, not disabled, while saving: a disabled button
              drops keyboard focus out of the dialog, and a result that keeps
              the form open (Cancel in main's confirmation) would leave the
              user nowhere. Clicks are ignored while busy instead. */}
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel()
            }}
            aria-disabled={busy}
            className={BUTTON}
          >
            Cancel
          </button>
          <button type="submit" aria-disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : mode === 'add' ? 'Add game' : 'Save'}
          </button>
        </div>
      </form>
    </ModalDialog>
  )
}

interface RemoveGameDialogProps {
  gameTitle: string
  busy: boolean
  onRemove: () => void
  onCancel: () => void
}

// Removing asks first (spec). Cancel has focus, so Enter alone never removes.
export function RemoveGameDialog({
  gameTitle,
  busy,
  onRemove,
  onCancel
}: RemoveGameDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <ModalDialog
      role="alertdialog"
      title={`Remove ${gameTitle} from your library?`}
      description="Its files on your PC are not touched."
      onCancel={onCancel}
      initialFocusRef={cancelRef}
    >
      <div className="flex justify-end gap-1">
        <button
          ref={cancelRef}
          type="button"
          onClick={() => {
            if (!busy) onCancel()
          }}
          aria-disabled={busy}
          className={BUTTON}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!busy) onRemove()
          }}
          aria-disabled={busy}
          className={DANGER}
        >
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </ModalDialog>
  )
}
