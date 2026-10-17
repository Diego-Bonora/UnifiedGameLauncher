import { useEffect, useRef, useState } from 'react'
import { APP_NAME, PROJECT_URL } from '@shared/app-info'
import { BUTTON } from './dialog-buttons'
import licenses from './generated/licenses.json'
import LongTextDialog from './LongTextDialog'
import {
  PRIVACY_INTRO,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  type PolicyItem
} from './privacy-policy'

type AboutDialog = 'license' | 'privacy' | 'components'

// How long "Copied" stays before the line clears; a failure stays, since it
// tells the user what to do instead.
const COPIED_MS = 3000

// The last group in Settings (docs/features/release.md, section 1). Every
// text here is bundled with the app, and nothing opens a web page: the
// project address is shown as text and main copies it.
function AboutSection(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const [versionFailed, setVersionFailed] = useState(false)
  useEffect(() => {
    let live = true
    window.api.app.getVersion().then(
      (value) => {
        if (live) setVersion(value)
      },
      () => {
        if (live) setVersionFailed(true)
      }
    )
    return () => {
      live = false
    }
  }, [])

  const [openDialog, setOpenDialog] = useState<AboutDialog | null>(null)
  // The button that opened the dialog gets focus back once it has closed
  // (ModalDialog leaves that to its caller).
  const openerRef = useRef<AboutDialog | null>(null)
  const buttonsRef = useRef<Partial<Record<AboutDialog, HTMLButtonElement | null>>>({})
  useEffect(() => {
    if (openDialog !== null || openerRef.current === null) return
    const opener = openerRef.current
    openerRef.current = null
    buttonsRef.current[opener]?.focus()
  }, [openDialog])
  const open = (dialog: AboutDialog): void => {
    openerRef.current = dialog
    setOpenDialog(dialog)
  }
  const close = (): void => setOpenDialog(null)

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // An answer that arrives after Settings was left must not start a timer
  // nobody clears. Set in the effect (not at creation) so StrictMode's
  // mount, cleanup, mount in development ends with it true.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = null
    }
  }, [])
  const showCopyStatus = (status: 'copied' | 'failed'): void => {
    if (!mountedRef.current) return
    // Each answer replaces the last one's timer, so two quick clicks can't
    // let the first click's timer clear the second click's "Copied".
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current =
      status === 'copied' ? setTimeout(() => setCopyStatus('idle'), COPIED_MS) : null
    setCopyStatus(status)
  }
  const copyLink = (): void => {
    // A rejection is a caller bug (main refused the call); for the user it
    // is the same as the clipboard saying no.
    void window.api.app.copyProjectLink().then(
      ({ copied }) => showCopyStatus(copied ? 'copied' : 'failed'),
      () => showCopyStatus('failed')
    )
  }

  return (
    <section aria-labelledby="settings-about" className="flex flex-col gap-2">
      <h2 id="settings-about" className="text-lg font-semibold">
        About
      </h2>
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3">
        <p>
          <span className="font-semibold">{APP_NAME}</span>{' '}
          <span className="text-muted">
            {version !== null ? `version ${version}` : versionFailed ? 'version unknown' : '…'}
          </span>
        </p>
        <p className="text-sm text-muted">
          Not affiliated with Valve, Epic Games, GOG, Ubisoft, Blizzard or Electronic Arts.
        </p>
        <p className="text-sm text-muted">Open source under the MIT License.</p>
        <div className="flex flex-wrap gap-1">
          <button
            ref={(element) => {
              buttonsRef.current.license = element
            }}
            type="button"
            onClick={() => open('license')}
            className={BUTTON}
          >
            View license
          </button>
          <button
            ref={(element) => {
              buttonsRef.current.privacy = element
            }}
            type="button"
            onClick={() => open('privacy')}
            className={BUTTON}
          >
            Privacy policy
          </button>
          <button
            ref={(element) => {
              buttonsRef.current.components = element
            }}
            type="button"
            onClick={() => open('components')}
            className={BUTTON}
          >
            Open-source components
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="text-sm text-muted">Project page:</span>
          {/* select-all: one click selects the whole address, for copying by
              hand if the clipboard ever refuses. */}
          <span className="text-sm break-all select-all">{PROJECT_URL}</span>
          <button type="button" onClick={copyLink} className={BUTTON}>
            Copy link
          </button>
          <p role="status" className="text-sm">
            {copyStatus === 'copied' && <span className="text-success">Copied</span>}
            {copyStatus === 'failed' && (
              <span className="text-danger">
                Couldn&apos;t copy the link. Select it and copy it with Ctrl+C.
              </span>
            )}
          </p>
        </div>
      </div>

      {openDialog === 'license' && (
        <LongTextDialog title="MIT License" onClose={close}>
          <pre className="font-body whitespace-pre-wrap">{licenses.appLicense}</pre>
        </LongTextDialog>
      )}
      {openDialog === 'privacy' && (
        <LongTextDialog title="Privacy policy" onClose={close}>
          <PrivacyPolicy />
        </LongTextDialog>
      )}
      {openDialog === 'components' && (
        <LongTextDialog title="Open-source components" onClose={close}>
          <OpenSourceComponents />
        </LongTextDialog>
      )}
    </section>
  )
}

function PolicyBullet({ item }: { item: PolicyItem }): React.JSX.Element {
  if (typeof item === 'string') return <li>{item}</li>
  return (
    <li>
      <span className="font-semibold">{item.lead}</span>
      {item.text !== undefined && <> {item.text}</>}
      {item.items !== undefined && (
        <ul className="mt-0.5 list-[circle] pl-3">
          {item.items.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

function PrivacyPolicy(): React.JSX.Element {
  // A plain date, so it reads the same in every time zone.
  const lastUpdated = new Date(`${PRIVACY_LAST_UPDATED}T00:00:00Z`).toLocaleDateString('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC'
  })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted">Last updated: {lastUpdated}</p>
      <p>{PRIVACY_INTRO}</p>
      {PRIVACY_SECTIONS.map((section) => (
        <div key={section.heading}>
          <h3 className="font-semibold">{section.heading}</h3>
          <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-3">
            {section.items.map((item) => (
              <PolicyBullet key={typeof item === 'string' ? item : item.lead} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function OpenSourceComponents(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p>
        {APP_NAME} is built with these open-source packages. Each one&apos;s full license text is in
        the <span className="font-semibold">resources\licenses</span> folder inside the
        program&apos;s folder. Electron includes Chromium, whose licenses are in
        LICENSES.chromium.html next to the program.
      </p>
      <table className="w-full text-left">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-0.5 pr-2 font-semibold">
              Package
            </th>
            <th scope="col" className="py-0.5 pr-2 font-semibold">
              Version
            </th>
            <th scope="col" className="py-0.5 font-semibold">
              License
            </th>
          </tr>
        </thead>
        <tbody>
          {licenses.components.map((component) => (
            <tr key={`${component.name}@${component.version}`} className="border-t border-border">
              <td className="py-0.5 pr-2 break-all">{component.name}</td>
              <td className="py-0.5 pr-2">{component.version}</td>
              <td className="py-0.5">{component.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AboutSection
