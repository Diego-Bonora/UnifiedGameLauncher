

## 2026-10-17 (Milestone 7 spec and Step 1)
**Decided (spec `docs/features/release.md`, user's calls):**
- **Release basics:** v1 keeps the name UnifiedGameLauncher and ships under MIT.
- **Updates:** the app asks before downloading. A Settings switch is on by default; an unreadable `settings.json` counts as off.
- **About and privacy:** About + privacy go at the bottom of Settings. Copy link goes through a main IPC with no arguments; no `https://` is added to the allow-list.
- **Release flow:** CI uploads to a draft release on a `v*` tag. The test releases are 0.9.0 → 0.9.1, then 1.0.0. `appId`, the package name and the repo are kept for good.
- **Disconnect** deletes account data only (Steam ID, saved library, covers of games not in the latest installed read); the key and favorites stay.
- **Spec review (16 findings, folded in):** `autoDownload` must be switched off; the privacy draft was inaccurate (updater cache in `%LOCALAPPDATA%`, no installed list saved); some bundled licenses aren't MIT; the updater states and CI edge cases were missing.

**Built (738 tests, 709 before):**
- `manual-covers.ts`: Change .exe to an exe without an icon drops the old icon. A folder that can't be listed stops the sync.
- `cover-files.ts` `listCoverFilesIn` rejects on anything but ENOENT; each caller decides what that means.
- Typed `SteamConnectResult`, `SteamSetApiKeyResult`, `SteamDisconnectResult`; wording in new `steam-messages.ts`.
- Disconnect:
  - `steam-auth.ts`: data first, connection last, stays connected on failure.
  - The `disconnectGeneration` counter is taken before the state read; `waitForDisconnects()` loops; a read overtaken by a disconnect saves nothing.
  - `cover-cache.ts`: `latestInstalled` decides what `clearCovers` keeps.
  - UI: `DisconnectSteamDialog.tsx`, the button and focus return in `SettingsScreen.tsx`, `'done' | 'failed' | 'busy'` in `use-steam-library.ts`.
- `ipc/app-handle.ts` `handleFromApp` (the sender check, moved from `manual.ts`) now wraps every handler in steam, steam-auth, epic, favorites and manual.
- `dialog-buttons.ts`: shared button styles.

**Fixed by review (3 rounds, last clean):** a read already checking the connection still saved the library after Disconnect; covers of games uninstalled this session survived it; a stuck error line; a second click closed the dialog; no sender check outside manual games.

**Verified:**
- **Dev app (macOS, CDP):** the dialog survives StrictMode; Esc and Cancel return focus; a real Disconnect deletes the Steam ID and library and keeps the key (dev data backed up and restored).
- **Dev app and production build (`file://`):** the Steam, Epic, favorites and manual calls pass the sender check.
- **Not verified:** installed covers surviving Disconnect on a real PC (no Steam games on the Mac); that is Windows test item 7.

**Next:** Step 2 (About, privacy, licenses).
**Blocked by:** nothing. Open: the Milestone 6 Windows test items; the spec's open items (SmartScreen during an update, the single-instance lock after Restart now, the sha512 / missing `latest.yml` behaviour, to be read in step 4); older open items in progress-archive.md.
