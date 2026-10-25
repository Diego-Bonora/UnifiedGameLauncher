# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4, the library layout and 6 are on `main`. Milestone 7 (spec `release.md`): Steps 1–5 done (Disconnect, About/privacy/licenses, app icon, auto-updates, release workflow; 888 tests). 0.9.0 is cut (`bdc470c`, run 40159108918 green); its draft holds all three files, unpublished, so installed copies find no release yet. The Milestone 6 Windows test is half done, a separate task.

## In Progress
Milestone 7 Step 6: the Windows test of the release path (release.md §8).

## Next Up
The user publishes the 0.9.0 draft, then Step 6 on the Windows PC (release.md §8): install 0.9.0, About, cut 0.9.1 (ask first) and test the update, the rest. Then: rest of the Milestone 6 test, Electron upgrade, 1.0.0.

---

## 2026-10-24 (Milestone 7 Step 5: release workflow)
**Built (888 tests, 840 before):**
- `.github/workflows/build-installer.yml`: `build` job (windows, read-only token, every run): on a tag, `release.mjs before` before `npm ci`; then `npm run build` first (licenses check fails early), lint, test, `electron-builder --win nsis --x64 --publish never`, artifact `installer` (exe, blockmap, `latest.yml`). `publish` job (ubuntu, tag pushes with `refs/tags/v` only, `contents: write`): no npm install, actions pinned to commit SHAs (checkout/setup-node v4.4.0, download-artifact v4.3.0), runs `release.mjs publish`. Both checkouts `persist-credentials: false`; concurrency per ref.
- `app/scripts/release.mjs` (the command, always runs) + `release-checks.mjs` (library, no imports): tag = `v` + plain X.Y.Z, tag still points at the run's commit (re-runs keep their old commit), no published release under either spelling; publish reuses only an exact-tag draft (refuses the other spelling and two drafts), creates once (never retried), deletes same-named files then uploads (3 tries, 5 s apart, 10 min each), polls until the draft holds all three at the built sizes. `latest.yml`'s `path` must be a bare `*-setup.exe` name. Requests retry network errors/5xx.
- `app/scripts/check-packaged-app.mjs`: electron-builder `afterPack` hook, fails on `src/**` in app.asar before the installer exists (real build checked both ways). `@electron/asar` 3.4.1 pinned as a devDependency (electron-builder's own pin).
- `electron-builder.yml`: `afterPack`, `releaseType: draft`; `dist` gets `--x64`; CLAUDE.md Dev Commands; release.md §7.
**Decisions:** user's call after review: split build/publish so no dependency code runs next to the write token; electron-builder no longer uploads (spec bullet updated).
**Read in electron-builder's code:** with a published release for the tag it skips the upload with only a warning; tags match with or without `v`; afterPack runs before NSIS. A CLI target builds the host's arch (arm64 on the Mac) despite `arch: x64`.
**Fixed by review (5 rounds, last clean):** write token reachable by dependency code; source check after upload; an old run's re-run overwriting a newer draft; silent exit 0; untested publish flow (now a fake GitHub; 17 mutations caught); `latest.yml` path steering reads; other-spelling draft.
**Verified:** checks against the real repo (read-only); tag lookup vs `git ls-remote`; local x64 NSIS builds (real `latest.yml` is the fixture).
**Next:** cut 0.9.0 (done: upload worked first time), then Step 6.
**Blocked by:** nothing. Open: the upload code has never run against real GitHub; a hidden `starter` asset after a broken upload may need the draft deleted; annotated tags untested (use plain); `npm audit` Electron advisory (upgrade before 1.0).

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
