

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

## 2026-10-17 (Milestone 7 Step 2: About, privacy policy, licenses)
**Built (`0517ddc`, 770 tests, 738 before):**
- `LICENSE` (MIT) at the repo root; `package.json` `"license": "MIT"`.
- Licenses: `scripts/bundled-packages-plugin.ts` records what each build bundles (incl. CSS `@import`s; unknown virtual modules fail). `scripts/licenses.mjs` adds the production tree and Electron, checks an SPDX allow-list + `LICENSE_EXCEPTIONS`, copies texts to `resources\licenses`. `npm run build` fails on a stale `generated/licenses.json`; `npm run licenses` rewrites it (10 components).
- Installer no longer packs `scripts/`, `.nvmrc` (checked in `app.asar`).
- Main: `ipc/app.ts`, `app-handlers.ts`, `shared/ipc/app-channels.ts`: `getVersion`, `copyProjectLink` (no payload; writes `PROJECT_URL`, reads it back). `spellcheck: false`.
- Renderer: `AboutSection.tsx` (last group in Settings), `ModalDialog` `size="long"`, `LongTextDialog.tsx`, `privacy-policy.ts` (+ test tying folder names to the package name).
**Decisions:** the list is committed (dev works, changes show in diffs). The policy lists only today's behaviour; GitHub/updates/settings lines come with Step 4. Spec corrected: program folder `%LOCALAPPDATA%\Programs\unified-game-launcher` (package name). PROJECT_PLAN.md §12 is a pointer.
**Fixed by review (2 rounds):** Tailwind unlisted; `--write` after `npm run dev` dropped React; no exception path; "Copied" on a silent clipboard failure; timer race; locale sort; `?commonjs-external` ids (not re-reviewed, user's call).
**Verified (macOS dev app + CDP, StrictMode):** version; Copy link copies exactly the URL, the window's own clipboard write is refused; dialogs scroll; Esc/Close return focus; 600 px.
**Next:** Step 3 (app icon).
**Blocked by:** nothing. Open: Step 4 must add `lazy-val` (electron-updater, no license file) to `LICENSE_EXCEPTIONS`, the updater lines to the policy, and a test tying main's hosts to the policy; Step 5 an early CI licenses check; Step 6 confirm the program folder. Known gaps: a package's CSS importing another package, Tailwind plugins, unquoted `@import url(x)`; `spellcheck: false` not observed in the app.
