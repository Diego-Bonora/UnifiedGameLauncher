# Progress Archive

> History only. Not loaded automatically. Newest at bottom.

## 2026-09-20
**Built:** docs only, no code: docs/spec.md, docs/features/auth-roles.md, docs/design/direction.md, docs/brand.md (new), CLAUDE.md, this file.
**Decisions:** v1 = Steam + Epic only (GOG/Ubisoft/Battle.net/EA in v2). Auto-updates IN v1 (electron-updater, Milestone 7; works unsigned). Windows only. Unsigned installer for v1; signing (SignPath free OSS program or Azure Trusted Signing) revisited before the M7 release. Epic built in two stages: installed detection + launch first, owned library separate and allowed to fail. electron-vite + npm + Vitest + ESLint + Prettier + Tailwind. Dark only, violet accent `#8B5CF6`, Sora + Manrope (bundled locally), cover grid + left sidebar. Working title UnifiedGameLauncher kept in one `APP_NAME` constant. Framework lives in `app/` with `src/shared`, `src/main/{ipc,security,storage,library,stores/{steam,epic}}`, `src/preload`, `src/renderer/src`.
**Next:** Milestone 0 scaffold.
**Blocked by:** nothing.

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

## 2026-09-20 (Milestone 0: Tailwind + design tokens)
**Built:** Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`) wired into the renderer in `electron.vite.config.ts`. `src/renderer/src/assets/main.css` now holds the design tokens from docs/design/direction.md in an `@theme static` block (10 colors, `--font-display`/`--font-body`, 8px `--spacing`, `--radius-card` 12px, `--radius-control` 8px), plus base styles. `App.tsx` restyled with token utilities. Fonts via `@fontsource-variable/sora` and `@fontsource-variable/manrope`.
**Decisions:** Tokens live in CSS `@theme`, not a `tailwind.config` file (Tailwind v4 way; one source of truth). `@theme static` so every token is always emitted as a CSS variable, not only the ones a utility uses. Fonts come from npm packages so they ship in the app and work offline. `renderer.build.assetsInlineLimit: 0` so Vite never inlines assets as `data:` URIs, because the CSP has no `data:` for fonts. The CSP itself is unchanged.
**Next:** step 5 (remaining `src/main` folders), then step 6 (installer workflow).
**Blocked by:** nothing. Open items: `App.tsx` still has a temporary "Tokens loaded" chip to remove once real UI exists; `img-src` still allows `data:` and needs a decision for remote cover art; replace placeholder icons; verify the packaged asar has no `src/**` on the first CI build.

## 2026-09-20 (Milestone 0: main folders + visual check)
**Built:** `src/main/{ipc,storage,library,stores/steam,stores/epic}/`, each holding only a `.gitkeep` so git tracks the empty folder. Ran `npm run dev` and the user confirmed the placeholder window (fonts and tokens) looks right; dev server stopped by exact PID. `/review` (Plan subagent) found no problems: layout matches docs, nothing ignores or packages the `.gitkeep` files.
**Decisions:** No `StoreProvider` interface yet; it needs a real shape from Steam detection in Milestone 1. Delete each `.gitkeep` once a real file lands in its folder.
**Next:** step 6 (installer workflow).
**Blocked by:** nothing. Open items unchanged: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; verify the packaged asar has no `src/**` on the first CI build.
