import { useEffect, useRef } from 'react'
import { BUTTON, PRIMARY } from './dialog-buttons'
import { SETTINGS_UNREADABLE, settingsActions, settingsLine } from './update-messages'
import type { Updates } from './use-updates'

// The Updates group in Settings (docs/features/release.md, section 4): the
// "Check for updates automatically" switch, where updates stand, and the
// same actions as the sidebar notice. Shows main's status; holds none.
function UpdatesSection({ updates }: { updates: Updates }): React.JSX.Element {
  const { status } = updates
  const lineRef = useRef<HTMLDivElement>(null)

  // Buttons here come and go with main's state (an automatic check hides
  // Download again while it runs). If the focused one goes, focus would
  // fall to the page; the status line takes it instead.
  const focusInsideRef = useRef(false)
  const kind = status?.state.kind
  useEffect(() => {
    if (focusInsideRef.current && document.activeElement === document.body) {
      lineRef.current?.focus()
    }
  }, [kind])

  const line = status !== null ? settingsLine(status) : null
  const actions = status !== null ? settingsActions(status) : null
  const state = status?.state

  return (
    <section aria-labelledby="settings-updates" className="flex flex-col gap-2">
      <h2 id="settings-updates" className="text-lg font-semibold">
        Updates
      </h2>
      <div
        onFocus={() => {
          focusInsideRef.current = true
        }}
        onBlur={(event) => {
          // Only a move somewhere else in the window counts as leaving. A
          // removed button fires no blur, which is how a lost focus is
          // recognised above. Switching to another app does fire one, but focus
          // comes back here with the window, so it doesn't count either: the
          // 6-hourly check mostly runs while the app is in the background.
          const windowLeft = !document.hasFocus()
          if (!windowLeft && !event.currentTarget.contains(event.relatedTarget)) {
            focusInsideRef.current = false
          }
        }}
        className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3"
      >
        {status !== null && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span id="updates-switch-label">Check for updates automatically</span>
              <button
                type="button"
                role="switch"
                aria-checked={status.enabled}
                aria-labelledby="updates-switch-label"
                aria-disabled={updates.savingSwitch}
                onClick={() => {
                  if (!updates.savingSwitch) updates.setEnabled(!status.enabled)
                }}
                className={`relative h-3 w-5 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-disabled:opacity-60 ${
                  status.enabled ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border'
                }`}
              >
                {/* The knob, drawn as a plain circle. */}
                <span
                  aria-hidden="true"
                  className={`absolute top-0.5 h-2 w-2 rounded-full bg-text transition-[left] ${
                    status.enabled ? 'left-2.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {status.settingsUnreadable && (
              <p role="alert" className="text-sm text-danger">
                {SETTINGS_UNREADABLE}
              </p>
            )}
            {updates.switchProblem !== null && (
              <p role="alert" className="text-sm text-danger">
                {updates.switchProblem}
              </p>
            )}
          </>
        )}

        {/* One live region from the first render on, so the first real
            status is announced as a change, not inserted already filled. */}
        <div
          ref={lineRef}
          tabIndex={-1}
          className={`flex flex-col gap-1 focus:outline-none ${status !== null ? 'border-t border-border pt-2' : ''}`}
        >
          <p
            role="status"
            className={`text-sm ${line?.tone === 'danger' ? 'text-danger' : 'text-muted'}`}
          >
            {line?.text ?? 'Checking your update settings…'}
          </p>
          {state?.kind === 'downloading' && (
            <div className="flex items-center gap-1">
              <div
                role="progressbar"
                aria-label="Download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.percent}
                className="h-0.5 max-w-40 flex-1 overflow-hidden rounded-full bg-surface-2"
              >
                <div className="h-full bg-accent" style={{ width: `${state.percent}%` }} />
              </div>
              <span aria-hidden="true" className="text-sm text-muted tabular-nums">
                {state.percent}%
              </span>
            </div>
          )}
        </div>

        {actions !== null && (actions.checkNow || actions.download || actions.restart) && (
          <div className="flex flex-wrap gap-1">
            {actions.restart && (
              <button type="button" onClick={updates.restart} className={PRIMARY}>
                Restart now
              </button>
            )}
            {actions.download && (
              <button
                type="button"
                onClick={() => {
                  // The button goes once the download starts; the status
                  // line, which then shows it, takes focus now.
                  lineRef.current?.focus()
                  updates.download()
                }}
                className={PRIMARY}
              >
                {state?.kind === 'downloadFailed' ? 'Download again' : 'Download'}
              </button>
            )}
            {actions.checkNow && (
              <button
                type="button"
                // Busy only while this press waits. During an automatic
                // check it stays live: pressing it joins that check, whose
                // failure then gets the Check now message (spec).
                aria-disabled={updates.checking}
                onClick={() => {
                  if (!updates.checking) updates.checkNow()
                }}
                className={BUTTON}
              >
                Check now
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default UpdatesSection
