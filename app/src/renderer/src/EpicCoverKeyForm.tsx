import { useEffect, useRef, useState } from 'react'
import type {
  EpicClearCoverKeyResult,
  EpicCoverStatus,
  EpicSetCoverKeyResult
} from '@shared/ipc/epic-channels'
import {
  coverKeyMessage,
  coverStatusLine,
  shouldShowKeyForm,
  type CoverKeyProblem
} from './epic-cover-messages'

interface EpicCoverKeyFormProps {
  status: EpicCoverStatus
  // The save/remove calls and their busy flag live in the app-wide Epic hook,
  // which also applies the new status; see use-epic-library.ts.
  busy: boolean
  onSave: (apiKey: string) => Promise<EpicSetCoverKeyResult | 'busy' | 'failed'>
  onClear: () => Promise<EpicClearCoverKeyResult | 'busy' | 'failed'>
}

// The SteamGridDB key for Epic covers. Out of the way once it works: the full
// form only shows with no key or a rejected one; otherwise a single quiet line
// with a Remove button. The key is sent to main and never comes back.
function EpicCoverKeyForm({
  status,
  busy,
  onSave,
  onClear
}: EpicCoverKeyFormProps): React.JSX.Element {
  const [keyInput, setKeyInput] = useState('')
  // An action's error, tagged with the status it was shown under. It stops
  // showing once the status moves on (a background notice, another action) or
  // the user starts typing, so an old message never sits next to a status it
  // no longer matches. Derived, not cleared by an effect: an effect would also
  // wipe a message that the same click had just set alongside a new status.
  const [actionError, setActionError] = useState<{
    problem: CoverKeyProblem
    shownFor: string
  } | null>(null)

  const line = coverStatusLine(status)
  const statusKey = (s: EpicCoverStatus): string => `${s.hasKey}|${s.problem ?? 'none'}`
  const problem =
    actionError !== null && actionError.shownFor === statusKey(status) ? actionError.problem : null
  // The status as of the latest render, read when an answer arrives: an
  // error must be tagged with the status it will be shown next to, not the
  // one from when the button was clicked, or a status change during the call
  // would hide it before it ever appears.
  const latestStatusRef = useRef(status)
  useEffect(() => {
    latestStatusRef.current = status
  }, [status])
  const setProblem = (next: CoverKeyProblem | null, shownFor?: EpicCoverStatus): void => {
    setActionError(
      next === null
        ? null
        : { problem: next, shownFor: statusKey(shownFor ?? latestStatusRef.current) }
    )
  }

  const handleSave = (event: React.FormEvent): void => {
    event.preventDefault()
    if (busy) return
    setProblem(null)
    void onSave(keyInput).then((result) => {
      // Another key action is still running; this click did nothing.
      if (result === 'busy') return
      if (result === 'failed') setProblem('failed')
      // Cleared only on success, so a typo can be fixed in place.
      else if (result.saved) setKeyInput('')
      else setProblem(result.reason)
    })
  }

  const handleRemove = (): void => {
    if (busy) return
    setProblem(null)
    void onClear().then((result) => {
      if (result === 'busy') return
      if (result === 'failed') setProblem('failed')
      else if (!result.cleared) setProblem('removeFailed', result.status)
    })
  }

  const removeButton = status.hasKey && (
    <button
      type="button"
      onClick={handleRemove}
      disabled={busy}
      className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
    >
      Remove key
    </button>
  )

  if (!shouldShowKeyForm(status)) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-muted">
          {line.text}
        </p>
        {removeButton}
        {problem !== null && (
          <p role="alert" className="text-sm text-danger">
            {coverKeyMessage(problem)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3">
      <p
        role={line.tone === 'danger' ? 'alert' : 'status'}
        className={line.tone === 'danger' ? 'text-danger' : 'text-muted'}
      >
        {line.text}
      </p>
      <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={keyInput}
          onChange={(event) => {
            setKeyInput(event.target.value)
            setProblem(null)
          }}
          placeholder="Paste your SteamGridDB API key"
          aria-label="SteamGridDB API key"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-3 py-1 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || keyInput.trim() === ''}
          className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Save
        </button>
        {removeButton}
      </form>
      <span className="text-xs text-muted">
        Get a free key at steamgriddb.com: sign in, then Preferences → API. It stays on this PC,
        encrypted, and is only sent to SteamGridDB.
      </span>
      {problem !== null && (
        <p role="alert" className="text-sm text-danger">
          {coverKeyMessage(problem)}
        </p>
      )}
    </div>
  )
}

export default EpicCoverKeyForm
