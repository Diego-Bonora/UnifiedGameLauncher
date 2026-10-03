import { useEffect, useRef, useState } from 'react'
import EpicCoverKeyForm from './EpicCoverKeyForm'
import type { EpicLibrary } from './use-epic-library'
import type { SteamLibrary } from './use-steam-library'

interface SettingsScreenProps {
  steam: SteamLibrary
  epic: EpicLibrary
  // Opened from an "Open Settings" button: that button is gone now, so
  // keyboard focus moves to this screen's heading instead of the page body.
  focusHeading: boolean
}

// Store connections and keys, one group per store so a future store adds its
// own. The forms behave exactly as they did on the old single page; their
// state (connection, saving, errors) lives in the app-wide hooks, so leaving
// this screen mid-save loses nothing but the text typed into an input.
function SettingsScreen({ steam, epic, focusHeading }: SettingsScreenProps): React.JSX.Element {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  const { connection, connecting, connectError, apiKeyError, savingApiKey } = steam

  const handleSaveApiKey = (event: React.FormEvent): void => {
    event.preventDefault()
    void steam.saveApiKey(apiKeyInput).then((saved) => {
      if (saved) setApiKeyInput('')
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        Settings
      </h1>

      <section aria-labelledby="settings-steam" className="flex flex-col gap-2">
        <h2 id="settings-steam" className="text-lg font-semibold">
          Steam
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3">
          <span className="text-muted">
            {connecting
              ? 'Waiting for you to finish signing in in your browser…'
              : connection?.status === 'connected'
                ? `Connected as Steam ID ${connection.steamId64}`
                : 'Not connected to Steam'}
          </span>
          {connecting ? (
            <button
              type="button"
              onClick={steam.cancelConnect}
              className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={steam.connect}
              className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover"
            >
              {connection?.status === 'connected' ? 'Reconnect Steam' : 'Connect Steam'}
            </button>
          )}
        </div>
        {connectError !== null && <p className="text-danger">{connectError}</p>}

        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3">
          <span className="text-muted">
            {connection?.hasApiKey === true
              ? 'Steam Web API key saved.'
              : 'No Steam Web API key saved yet — needed to show your owned games.'}
          </span>
          <form onSubmit={handleSaveApiKey} className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Paste your Steam Web API key"
              aria-label="Steam Web API key"
              autoComplete="off"
              spellCheck={false}
              disabled={savingApiKey}
              className="min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-3 py-1 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={savingApiKey || apiKeyInput.trim() === ''}
              className="rounded-control bg-accent px-3 py-1 text-sm font-medium transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
            {connection?.hasApiKey === true && (
              <button
                type="button"
                onClick={steam.clearApiKey}
                className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                Remove
              </button>
            )}
          </form>
          <span className="text-xs text-muted">
            Get a free key at steamcommunity.com/dev/apikey — it&apos;s tied to your account, never
            shared with anyone else.
          </span>
          {apiKeyError !== null && <p className="text-danger">{apiKeyError}</p>}
        </div>
      </section>

      <section aria-labelledby="settings-epic" className="flex flex-col gap-2">
        <h2 id="settings-epic" className="text-lg font-semibold">
          Epic
        </h2>
        {/* Always here (spec), even with no Epic games installed: this is the
            one place to add, check or remove the key. */}
        {epic.coverStatus !== null ? (
          <EpicCoverKeyForm
            status={epic.coverStatus}
            busy={epic.coverKeyBusy}
            onSave={epic.saveCoverKey}
            onClear={epic.clearCoverKey}
          />
        ) : epic.coverStatusFailed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-danger">
              Couldn&apos;t check your SteamGridDB key.
            </p>
            <button
              type="button"
              onClick={epic.reloadCoverStatus}
              className="rounded-control border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Try again
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted">
            Checking your SteamGridDB key…
          </p>
        )}
      </section>
    </div>
  )
}

export default SettingsScreen
