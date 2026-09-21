# UnifiedGameLauncher

Windows-only Electron app: one cover-art library for Steam and Epic (more stores in v2).

## Stack
- Frontend: React + Vite (electron-vite renderer), TypeScript strict, Tailwind + CSS variable tokens
- Backend: none. Electron main process only, local-only, no server
- Database: none. electron-store (JSON) in `%APPDATA%\<APP_NAME>`
- Auth: store login pages in the browser, tokens via Electron `safeStorage`
- Hosting: none. Installer on GitHub Releases (electron-builder, NSIS)
- Emulator / local dev: `npm run dev` (Electron window with HMR)

## Dev Commands
Run from `app/`:
- Start dev: `npm run dev`
- Run tests: `npm test` (Vitest)
- Lint / format: `npm run lint`, `npm run format`
- Build: `npm run build`
- Deploy: `npm run dist`, then upload to a GitHub Release (auto-updates read it via electron-updater)

## Coding Rules
- TypeScript `strict`; no `any` without a comment saying why
- All privileged work (files, registry, tokens, launching) lives in `main`; the renderer only calls the typed preload API
- Validate every IPC payload in `main` (zod). Channel names and schemas live in `src/shared`
- One folder per store under `main/stores/`, implementing a shared `StoreProvider` interface
- `shell.openExternal` only for allow-listed protocols (`steam://`, `com.epicgames.launcher://`)
- Never delete tokens on a network failure; show friendly "Reconnect your [Store]" messages, never raw errors
- App name only via the `APP_NAME` constant. Bundle fonts locally (offline)
- No code copied from other projects; comments explain why, not what
- Naming: `camelCase` vars/functions, `PascalCase` components/types, `kebab-case` folders, tests as `*.test.ts` beside the code

## Context Files
## Product
Before starting any feature, read @docs/spec.md for product context.

## Roles & Auth
Before touching auth or permissions, read @docs/features/auth-roles.md

## Progress
Current project state lives in @docs/progress.md

## Lessons
Before debugging or building, read @docs/lessons.md to avoid known mistakes.

## Design
For any UI work, read @docs/design/direction.md. Brand rules: @docs/brand.md

## Source Plan
Store research, security and privacy draft: @docs/sources/PROJECT_PLAN.md

## Rules
- Keep this file under 100 lines — token budget is precious
- Never inline large docs here — use @references instead
- Update the Gotchas section below whenever Claude makes a mistake
- Learning project: explain what you wrote and why; work one milestone at a time in small steps

## Gotchas
<!-- Format: - [date] [what went wrong and the rule going forward] -->
- [2026-09-20] An embedded Electron `BrowserWindow` for Steam OpenID login got blocked by Steam's Akamai WAF ("Access Denied") — likely the default User-Agent revealing `Electron/x.y.z`. Store logins must open the user's real system browser (`shell.openExternal`), with a local loopback HTTP server catching the OAuth/OpenID callback, never an in-app popup.
- [2026-09-20] A `zod` import reached `preload/index.ts` via a shared IPC file; the sandboxed preload can't `require()` npm deps, so it crashed silently and the window rendered black. Keep preload's import graph dependency-free (split channel names/types from zod schemas).
- [2026-09-20] Cleaned up a test run with `pkill -f "Electron"` and hit VS Code's helper process. Stop processes by exact PID only.
- [2026-09-20] A `pgrep -P` loop to kill the dev tree hung on an empty list. List with `ps -eo pid,ppid,command`, check the project path, kill those PIDs, confirm with `ps -p`.
- [2026-09-20] Guessed what "run it here" meant and started a download. When a request could mean dev app, installer or CI, ask first.
- [2026-09-20] `npm run dev` never rebuilds/restarts the main process on its own — only the renderer hot-reloads. Any edit under `src/main` or `src/preload` needs the dev tree killed by exact PID and restarted, or the app silently runs stale main code (e.g. "No handler registered" for a channel just added).
- [2026-09-20] Committed each step before running `/review`, which caused a fix-up commit every time. Review first (`git add -N` new files so `git diff HEAD` sees them), fix, then commit once.
- [2026-09-20] Handed the user a dev app started in a simulated-offline mode (dead `HTTPS_PROXY`) without saying it also breaks Steam sign-in, so their Reconnect failed. Say what a simulation breaks and restart the app normally before handing it back.
- [2026-09-21] Built Epic fixtures, tests and a Windows-test prompt on an assumed manifest shape (`MainGameAppName` == `AppName`); real manifests have it empty. Capture a real sample or make one plain request before building on a third-party format or endpoint; a reviewer's claim about one is not evidence.
