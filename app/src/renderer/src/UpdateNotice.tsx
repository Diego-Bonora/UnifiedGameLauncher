import { useEffect, useRef } from 'react'
import { DOWNLOAD_FAILED, type SidebarNotice } from './update-messages'

interface UpdateNoticeProps {
  notice: SidebarNotice | null
  onDownload: () => void
  onLater: (version: string) => void
  onRestart: () => void
  // Settings is open and says the same thing: the notice stays visible but
  // isn't announced, so a screen reader doesn't read each change twice.
  quiet: boolean
  // The notice took focus away with it (it disappeared while focused).
  onFocusLost: () => void
}

// Sized for the 224 px sidebar (8 px per spacing unit here, not 4).
const SMALL =
  'rounded-control border border-border px-1 py-0.5 text-xs font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const SMALL_PRIMARY =
  'rounded-control bg-accent px-1 py-0.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2'

function noticeText(notice: SidebarNotice): string {
  switch (notice.kind) {
    case 'available':
      return `Version ${notice.version} is available`
    case 'downloading':
      return 'Downloading update…'
    case 'ready':
      return 'Update ready'
    case 'downloadFailed':
      return DOWNLOAD_FAILED
  }
}

// The update notice at the bottom of the sidebar, above Settings
// (docs/features/release.md, section 4). The text line is a live region that
// is always there, so a new offer is announced; the percent sits outside it
// and isn't read out every second.
function UpdateNotice({
  notice,
  onDownload,
  onLater,
  onRestart,
  quiet,
  onFocusLost
}: UpdateNoticeProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  // The notice can change or vanish without a click (an automatic check
  // hides Download again while it runs). If focus was in it and would now
  // fall to the page, or sit on the emptied box, it moves on instead.
  const focusInsideRef = useRef(false)
  const kind = notice?.kind ?? null
  useEffect(() => {
    if (!focusInsideRef.current) return
    const active = document.activeElement
    if (active === document.body || (kind === null && active === boxRef.current)) {
      focusInsideRef.current = false
      onFocusLost()
    }
  }, [kind, onFocusLost])

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
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
      aria-label={notice !== null ? 'App update' : undefined}
      role={notice !== null ? 'group' : undefined}
      className={
        notice !== null
          ? 'flex flex-col gap-1 rounded-card border border-border bg-surface-2 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          : undefined
      }
    >
      <p role="status" aria-live={quiet ? 'off' : 'polite'} className="text-xs font-medium">
        {notice !== null ? noticeText(notice) : ''}
      </p>
      {notice?.kind === 'downloading' && (
        <div className="flex items-center gap-1">
          <div
            role="progressbar"
            aria-label="Download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={notice.percent}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface"
          >
            <div className="h-full bg-accent" style={{ width: `${notice.percent}%` }} />
          </div>
          <span aria-hidden="true" className="w-4 text-right text-xs text-muted tabular-nums">
            {notice.percent}%
          </span>
        </div>
      )}
      {(notice?.kind === 'available' || notice?.kind === 'downloadFailed') && (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => {
              // The button goes once the download starts; the notice, which
              // then shows the progress, takes focus now.
              boxRef.current?.focus()
              onDownload()
            }}
            className={SMALL_PRIMARY}
          >
            {notice.kind === 'available' ? 'Download' : 'Download again'}
          </button>
          <button type="button" onClick={() => onLater(notice.version)} className={SMALL}>
            Later
          </button>
        </div>
      )}
      {notice?.kind === 'ready' && (
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={onRestart} className={SMALL_PRIMARY}>
            Restart now
          </button>
        </div>
      )}
    </div>
  )
}

export default UpdateNotice
