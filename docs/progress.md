# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 0 is partly done. `app/` is scaffolded (electron-vite, React + TS), hardened to the project's Electron security rules, and styled with Tailwind v4 plus the design tokens and locally bundled Sora/Manrope fonts (committed: `988b742`, `92fe492`). The full `src/main` folder layout now exists (step 5, uncommitted). The placeholder window was checked visually and looks right. Typecheck passes; no installer has been built.

## In Progress
Nothing active. Milestone 0 steps 1 to 5 are done. Step 5 got a `/review` pass with no problems found.

## Next Up
Milestone 0 step 6: Windows installer built by a GitHub Actions workflow (the dev machine is macOS).

---

## 2026-09-20 (Milestone 0: main folders + visual check)
**Built:** `src/main/{ipc,storage,library,stores/steam,stores/epic}/`, each holding only a `.gitkeep` so git tracks the empty folder. Ran `npm run dev` and the user confirmed the placeholder window (fonts and tokens) looks right; dev server stopped by exact PID. `/review` (Plan subagent) found no problems: layout matches docs, nothing ignores or packages the `.gitkeep` files.
**Decisions:** No `StoreProvider` interface yet; it needs a real shape from Steam detection in Milestone 1. Delete each `.gitkeep` once a real file lands in its folder.
**Next:** step 6 (installer workflow).
**Blocked by:** nothing. Open items unchanged: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; verify the packaged asar has no `src/**` on the first CI build.

## 2026-09-20 (Milestone 0: Tailwind + design tokens)
**Built:** Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`) wired into the renderer in `electron.vite.config.ts`. `src/renderer/src/assets/main.css` now holds the design tokens from docs/design/direction.md in an `@theme static` block (10 colors, `--font-display`/`--font-body`, 8px `--spacing`, `--radius-card` 12px, `--radius-control` 8px), plus base styles. `App.tsx` restyled with token utilities. Fonts via `@fontsource-variable/sora` and `@fontsource-variable/manrope`.
**Decisions:** Tokens live in CSS `@theme`, not a `tailwind.config` file (Tailwind v4 way; one source of truth). `@theme static` so every token is always emitted as a CSS variable, not only the ones a utility uses. Fonts come from npm packages so they ship in the app and work offline. `renderer.build.assetsInlineLimit: 0` so Vite never inlines assets as `data:` URIs, because the CSP has no `data:` for fonts. The CSP itself is unchanged.
**Next:** step 5 (remaining `src/main` folders), then step 6 (installer workflow).
**Blocked by:** nothing. Open items: `App.tsx` still has a temporary "Tokens loaded" chip to remove once real UI exists; `img-src` still allows `data:` and needs a decision for remote cover art; replace placeholder icons; verify the packaged asar has no `src/**` on the first CI build.

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
