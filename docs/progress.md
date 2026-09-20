# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 0 is partly done. `app/` is scaffolded (electron-vite, React + TS) and hardened to the project's Electron security rules. Typecheck, lint, 5 Vitest tests and `npm run build` pass, and `npm run dev` starts cleanly. It renders only a placeholder screen. Nothing is committed yet: `app/` is untracked. No installer has been built.

## In Progress
Nothing active. Milestone 0 steps 1, 2 and 4 are done, and two independent `/review` passes found no blockers.

## Next Up
Commit the scaffold, then Milestone 0 step 3: Tailwind with the CSS variable design tokens (read docs/design/direction.md first). After that: step 5 (remaining `src/main` folders: ipc, storage, library, stores/{steam,epic}) and step 6 (Windows installer via a GitHub Actions workflow).

---

## 2026-09-20 (Milestone 0: scaffold)
**Built:** `app/` from the electron-vite react-ts template, then reworked:
- `src/shared/app-info.ts` (`APP_NAME`, `APP_ID`) and `src/shared/api.ts` (empty typed `RendererApi`).
- `src/main/index.ts`: sandbox, contextIsolation and nodeIntegration set explicitly; popups denied; `will-navigate` and `will-redirect` blocked outside the dev server; single-instance lock; permission request and check handlers both deny; `userData` pinned to `%APPDATA%\UnifiedGameLauncher` (`UnifiedGameLauncher (dev)` in dev).
- `src/main/security/external-url.ts` plus tests (allow-list of `steam:` and `com.epicgames.launcher:`, `isSameOrigin`).
- Preload exposes only `window.api` (no `ipcRenderer`). CSP tightened.
- Config: `@shared` alias in Vite, both tsconfigs and `vitest.config.ts`; `noImplicitAny` and `noUncheckedIndexedAccess` on; Windows-only `electron-builder.yml` publishing to GitHub Releases; `dist` script uses `--publish never`; version 0.1.0; `.nvmrc` (Node 22); real README.
**Decisions:** appId `io.github.diego-bonora.unifiedgamelauncher` (never change after first release; must match `APP_ID`). Installer is built by GitHub Actions on a Windows runner (the dev machine is macOS). `userData` is pinned to `APP_NAME` rather than derived from package name so a rename can't orphan tokens; dev uses a separate `(dev)` folder. Demo UI and mac/linux config removed. `electron-updater` waits for Milestone 7. The `extract-zip` audit warning (dev-time only) is left unfixed because the fix is breaking.
**Next:** commit, then Tailwind + design tokens (step 3).
**Blocked by:** nothing. Open items for later: replace the placeholder icons in `build/` and `resources/`; decide how remote cover art passes the CSP (`img-src`) before the library UI; verify the packaged asar has no `src/**` on the first CI build.

## 2026-09-20
**Built:** docs only, no code: docs/spec.md, docs/features/auth-roles.md, docs/design/direction.md, docs/brand.md (new), CLAUDE.md, this file.
**Decisions:** v1 = Steam + Epic only (GOG/Ubisoft/Battle.net/EA in v2). Auto-updates IN v1 (electron-updater, Milestone 7; works unsigned). Windows only. Unsigned installer for v1; signing (SignPath free OSS program or Azure Trusted Signing) revisited before the M7 release. Epic built in two stages: installed detection + launch first, owned library separate and allowed to fail. electron-vite + npm + Vitest + ESLint + Prettier + Tailwind. Dark only, violet accent `#8B5CF6`, Sora + Manrope (bundled locally), cover grid + left sidebar. Working title UnifiedGameLauncher kept in one `APP_NAME` constant. Framework lives in `app/` with `src/shared`, `src/main/{ipc,security,storage,library,stores/{steam,epic}}`, `src/preload`, `src/renderer/src`.
**Next:** Milestone 0 scaffold.
**Blocked by:** nothing.
