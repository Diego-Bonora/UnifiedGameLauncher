import { useRef } from 'react'
import { BUTTON, DANGER } from './dialog-buttons'
import ModalDialog from './ModalDialog'

interface DisconnectSteamDialogProps {
  busy: boolean
  onDisconnect: () => void
  onCancel: () => void
}

// Disconnecting deletes data, so it asks first (docs/features/release.md).
// Cancel has focus, so Enter alone never disconnects.
function DisconnectSteamDialog({
  busy,
  onDisconnect,
  onCancel
}: DisconnectSteamDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <ModalDialog
      role="alertdialog"
      title="Disconnect Steam?"
      description="Your Steam ID, your saved Steam library and the covers of games you don't have installed are deleted from this PC. Installed games stay, and so do your API key and favorites."
      onCancel={() => {
        if (!busy) onCancel()
      }}
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
            if (!busy) onDisconnect()
          }}
          aria-disabled={busy}
          className={DANGER}
        >
          {busy ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </ModalDialog>
  )
}

export default DisconnectSteamDialog
