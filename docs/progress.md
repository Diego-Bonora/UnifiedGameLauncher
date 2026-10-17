# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4, the library layout and 6 are on `main`. Milestone 7 (spec `docs/features/release.md`): Steps 1–4 done (Disconnect, About/privacy/licenses, app icon, auto-updates; 840 tests). No GitHub release exists yet, so installed copies show "Couldn't check for updates last time." The Milestone 6 Windows test is half done, a separate task.

## In Progress
Milestone 7: 5) release workflow, 6) Windows test of the release path.

## Next Up
Milestone 7 Step 5 (spec section 7): CI uploads the installer, `latest.yml` and blockmap to a draft release on a `v*` tag; early licenses check; first test release 0.9.0.

---

## 2026-10-17 (Milestone 7 Step 4: auto-updates)
**Built (`b366609` main, `d7e2f3d` window; 840 tests, 776 before):**
- Main: `storage/settings-store.ts` (missing = on, unreadable = off and untouched until the switch is flipped); `updates/update-controller.ts` (the one state machine; 10 s / 6 h schedule, 60 s check timeout, 2 min stall / 10 min before first progress, Restart latch, failed version remembered until a check succeeds); `updates/electron-updater-port.ts` (only electron-updater import; `autoDownload` off); `ipc/updates*.ts`; inactive fallback when electron-updater can't start.
- Window: `update-messages.ts` (all wording), `use-updates.ts`, `UpdateNotice.tsx` (sidebar), `UpdatesSection.tsx` (Settings); focus recovery when buttons vanish, also with the window in the background.
- Licenses: 26 components; `lazy-val@1.0.5` exception (MIT, no license file upstream). Privacy policy: GitHub, settings, the `.updaterId` install ID (user's call: disclose). Test ties main's literal hosts and `electron-builder.yml` publish to the policy.
**Decisions (user's calls, all in release.md §4):** checks pause while a version is offered/downloading/ready; install-on-quit only if the switch was on when the download finished; Later undone by the user's own download; post-save failure and a never-started Restart accepted as limits.
**Read in electron-updater's code:** sha512 checked for full, partial and cached downloads; no release / no `latest.yml` rejects the check; its request timeout never fires under Electron (no `socket` event).
**Fixed by review (6 rounds main, 3 window):** second installer on a double Restart; stuck checks/downloads; undisclosed install ID; a fix that hid Download again; Check now couldn't join an automatic check; lost focus.
**Verified:** dev app via CDP with a temporary scripted fake updater (reverted): every notice/Settings state, focus paths, keyboard switch, 600 px drawer; real repo check fails cleanly; local NSIS build writes `app-update.yml` (this repo, no `publisherName`).
**Next:** Step 5.
**Blocked by:** nothing. Open: `npm audit` high advisory for Electron <=41.10.5 (we're on 39; pre-existing, plan an upgrade before 1.0); real download/install/SmartScreen/lock after Restart are Step 6; notice hidden in the closed drawer below 768 px.

## 2026-10-17 (Milestone 7 Step 3: app icon)
**Built (776 tests, 770 before):**
- `app/build/icon.svg`: a fan of three cover cards (violet shades on a `#14141C` tile with a `#2A2A3A` edge), plain rectangles only. The side cards are shorter so their tilted bottoms end behind the front card.
- `app/scripts/render-icon.mjs` (`npm run icon`, run by Electron): a hidden sandboxed window draws the SVG on a canvas at each size (16–256, never downscaled) and writes `build/icon.png`, `resources/icon.png` (512) and `build/icon.ico`. It refuses unexpected arguments and builds everything before the first write. `-- --preview <dir> [file.svg ...]` writes a sheet (every size on dark/light, 16 and 32 px enlarged).
- `app/scripts/ico.mjs` (+ `ico.d.mts`, `ico.test.ts`): packs PNG entries into an `.ico` (256 written as 0).
- `.gitignore`: `!app/build/`. The root template's `build/` had kept electron-builder's buildResources folder out of git, so CI never had `build/icon.ico`.
- `docs/brand.md` Logo line.

**Decisions (user's calls):** the fan (C) over a stack (B, sharpest at 16 px) and a shelf (A, looked like a bar chart), in its refined form (no notches under the front card). 16 px is soft on the tilted cards; accepted.

**Fixed by review (2 rounds, last clean):** stray arguments silently overwrote the committed icons; PNGs were written before the ICO was built; untested IHDR branch.

**Verified (macOS):**
- electron-builder 26 picks `build/icon.ico` (its `iconConverter.js`; no warning).
- A `--win --dir` package carries all 7 entries byte for byte in `UnifiedGameLauncher.exe`; `app.asar` holds neither `build/` nor `scripts/`.
- Re-rendering on this Mac is byte-identical.

**Not verified:** the icon in Windows (taskbar, Explorer, installer, shortcut), which is Step 6.

**Next:** Step 4 (auto-updates).
**Blocked by:** nothing. Open: `resources/icon.png` ships in `app.asar` unused (template leftover, spec asks for it); nothing checks the committed icons against the SVG (a Chromium on another OS may anti-alias differently); the first CI installer with the new icon is still to be built.

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
