import { useRef } from 'react'
import { BUTTON } from './dialog-buttons'
import ModalDialog from './ModalDialog'

interface LongTextDialogProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

// A dialog for reading: the text scrolls inside it, Close stays in view.
// Focus starts on the text itself rather than on Close, so the arrow keys and
// Page Down scroll it straight away and a screen reader starts at the top.
function LongTextDialog({ title, onClose, children }: LongTextDialogProps): React.JSX.Element {
  const textRef = useRef<HTMLDivElement>(null)
  return (
    <ModalDialog title={title} onCancel={onClose} initialFocusRef={textRef} size="long">
      <div
        ref={textRef}
        tabIndex={0}
        role="region"
        aria-label={title}
        className="min-h-0 flex-1 overflow-y-auto rounded-control bg-background/40 p-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onClose} className={BUTTON}>
          Close
        </button>
      </div>
    </ModalDialog>
  )
}

export default LongTextDialog
