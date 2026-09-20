# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 0 (setup) is done. `app/` is scaffolded (electron-vite, React + TS), hardened to the project's Electron security rules, and styled with Tailwind v4 plus the design tokens and locally bundled Sora/Manrope fonts. The "Build installer" GitHub Actions workflow ran green (lint, tests, `npm run dist`, asar source check) and produced `UnifiedGameLauncher-0.1.0-setup.exe`, which was installed and tested by hand on a Windows PC. No real features exist yet. Commit `7cae555` (this log) is local only, not pushed.

## In Progress
Nothing active.

## Next Up
Milestone 1: Steam installed games (detect installed Steam games from local files and launch them via `steam://`, no login). Needs the first real `StoreProvider` interface and the first zod-validated IPC channels.

---

## 2026-09-20 (Milestone 0: installer verified on Windows)
**Built:** nothing new. Ran "Build installer" from the Actions tab (green, 2m13s; the asar check found no root `/src`). Installed the artifact on a Windows PC and checked it by hand.
**Verified:** app opens with the right fonts and looks the same as `npm run dev` on the Mac; `%APPDATA%\UnifiedGameLauncher` (no "(dev)") is created; a second launch focuses the first window; uninstall removes the app and shortcut. Uninstall leaves `%APPDATA%\UnifiedGameLauncher` in place. That is electron-builder's default (`nsis.deleteAppDataOnUninstall: false`), it matches the privacy policy draft, and it is kept for v1.
**Decisions:** Artifact downloads from GitHub returned 404 in the browser on the PC until signed in to the right account; sign in first, or use `gh run download`. GitHub warns that `checkout@v4`, `setup-node@v4` and `upload-artifact@v4` use deprecated Node 20; not failing, bump later.
**Next:** Milestone 1.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; bump the Node 20 actions.

## 2026-09-20 (Milestone 0: installer workflow)
**Built:** `.github/workflows/build-installer.yml` (runs on manual dispatch or `v*` tags, `windows-latest`, in `app/`): `npm ci`, lint, tests, `npm run dist`, an asar check that fails if a root `/src` was packaged, then uploads `dist/*-setup.exe` as a workflow artifact. Added `.gitattributes` (`* text=auto eol=lf`).
**Decisions:** Build-only, no GitHub Release is published until Milestone 7 (publishing is outward-facing). `permissions: contents: read`. LF everywhere because Windows runners check out CRLF by default and Prettier expects LF. Checked locally: `icon.ico` has a 256px image (electron-builder's minimum), lint and `prettier --check` are clean.
**Next:** push, run the workflow, read the result. The NSIS build and asar check could not be tested on macOS.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; the asar `src/**` check is now automated but unproven until the first CI run.

## 2026-09-20 (Milestone 0: main folders + visual check)
**Built:** `src/main/{ipc,storage,library,stores/steam,stores/epic}/`, each holding only a `.gitkeep` so git tracks the empty folder. Ran `npm run dev` and the user confirmed the placeholder window (fonts and tokens) looks right; dev server stopped by exact PID. `/review` (Plan subagent) found no problems: layout matches docs, nothing ignores or packages the `.gitkeep` files.
**Decisions:** No `StoreProvider` interface yet; it needs a real shape from Steam detection in Milestone 1. Delete each `.gitkeep` once a real file lands in its folder.
**Next:** step 6 (installer workflow).
**Blocked by:** nothing. Open items unchanged: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; verify the packaged asar has no `src/**` on the first CI build.
