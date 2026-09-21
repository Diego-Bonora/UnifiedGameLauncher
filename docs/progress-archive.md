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

## 2026-09-20 (Milestone 0: installer workflow)
**Built:** `.github/workflows/build-installer.yml` (runs on manual dispatch or `v*` tags, `windows-latest`, in `app/`): `npm ci`, lint, tests, `npm run dist`, an asar check that fails if a root `/src` was packaged, then uploads `dist/*-setup.exe` as a workflow artifact. Added `.gitattributes` (`* text=auto eol=lf`).
**Decisions:** Build-only, no GitHub Release is published until Milestone 7 (publishing is outward-facing). `permissions: contents: read`. LF everywhere because Windows runners check out CRLF by default and Prettier expects LF. Checked locally: `icon.ico` has a 256px image (electron-builder's minimum), lint and `prettier --check` are clean.
**Next:** push, run the workflow, read the result. The NSIS build and asar check could not be tested on macOS.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; the asar `src/**` check is now automated but unproven until the first CI run.

## 2026-09-20 (Milestone 0: installer verified on Windows)
**Built:** nothing new. Ran "Build installer" from the Actions tab (green, 2m13s; the asar check found no root `/src`). Installed the artifact on a Windows PC and checked it by hand.
**Verified:** app opens with the right fonts and looks the same as `npm run dev` on the Mac; `%APPDATA%\UnifiedGameLauncher` (no "(dev)") is created; a second launch focuses the first window; uninstall removes the app and shortcut. Uninstall leaves `%APPDATA%\UnifiedGameLauncher` in place. That is electron-builder's default (`nsis.deleteAppDataOnUninstall: false`), it matches the privacy policy draft, and it is kept for v1.
**Decisions:** Artifact downloads from GitHub returned 404 in the browser on the PC until signed in to the right account; sign in first, or use `gh run download`. GitHub warns that `checkout@v4`, `setup-node@v4` and `upload-artifact@v4` use deprecated Node 20; not failing, bump later.
**Next:** Milestone 1.
**Blocked by:** nothing. Open items: remove the temporary "Tokens loaded" chip once real UI exists; decide `img-src` for remote cover art; replace placeholder icons; bump the Node 20 actions.

## 2026-09-20 (Milestone 1: Steam installed games)
**Built:** `src/main/stores/store-provider.ts` (shared `StoreProvider` interface). `src/main/stores/steam/`: `vdf.ts` (Valve KeyValues parser), `app-manifest.ts`, `library-folders.ts`, `steam-registry.ts` (`reg query`-based `SteamPath` lookup), `steam-provider.ts`, `index.ts` — each with a `*.test.ts` beside it (20 tests total). `src/shared/ipc/steam-channels.ts` (zero-dependency channel names/types) and `steam.ts` (main-only zod schemas). `src/main/ipc/steam.ts` (the `getInstalledGames`/`launch` handlers). Preload/renderer wiring. New `app/scripts/check-preload-deps.mjs`, wired into `npm run build`.
**Decisions:** Registry access shells out to `reg query` via `child_process.execFile` instead of a native registry package. One VDF parser reused for both `.vdf`/`.acf` files. `getLaunchUrl` returns a URL string instead of launching directly, keeping the `steam://` allow-list check centralized in the IPC handler.
**Fixed:** A real bug the user caught live — the sandboxed preload can only `require()` a small Electron built-in allowlist, not npm packages; a `zod` import reached it transitively and blanked the whole window. Fixed by splitting channel names/types (zero deps) from zod schemas (main-only). Two `/review` passes fixed a mislabeled IPC field, a silently-swallowed Play-button failure, a decorative zod schema never enforced, and added `check-preload-deps.mjs`.
**Verified:** Committed as `c92bd09`, pushed, CI green. Installed on the Windows PC: list shows each detected Steam game with a Play button, launches through Steam.
**Next:** Milestone 2 (Steam sign-in + owned library + cover art).
**Blocked by:** nothing.

## 2026-09-20 (Milestone 2, Step 1: Steam OpenID sign-in)
**Built:** `app/src/main/stores/steam/openid.ts` (OpenID 2.0 `checkid_setup`/`check_authentication` flow — see Decisions), `app/src/main/storage/connection-store.ts` (plain-JSON `connections.json`, read-merge-write behind a write queue, `SteamConnection` as a discriminated union), `app/src/main/ipc/steam-auth.ts` (`signIn`/`cancelSignIn`/`disconnect`/`getConnectionStatus` handlers). Extended `shared/ipc/steam-channels.ts`/`steam.ts`, `preload/index.ts`, `shared/api.ts`. `App.tsx` gained a "Connect Steam"/"Reconnect Steam" button, a "waiting for your browser" state with Cancel, and shows the connected SteamID64. 38 Vitest tests total (11 in `openid.test.ts`, including a real loopback-server integration test for the original race condition).
**Decisions:** Steam's login page opens in the user's **system browser** (`shell.openExternal`), not an embedded `BrowserWindow` — the embedded approach was tried first and got hard-blocked by Steam's Akamai WAF (see docs/lessons.md); a real loopback HTTP server on `127.0.0.1` (ephemeral port) catches the callback instead, like `gh auth login`. `electron-store` was **not** added as a dependency; `connections.json` is hand-rolled plain JSON with the same injectable-deps test pattern as M1, since it's not a secret.
**Fixed (two `/review` passes):** Round 1 found and fixed a real race condition (a cancelled flow's delayed verification could clobber a newer flow's state), a missing anti-CSRF binding on the loopback callback, a redundant zod re-validation, and no feedback/logging on failure paths. Round 2 confirmed those and fixed a concurrent-writer race in `connection-store.ts` (write queue) and unlogged write errors.
**Verified:** Manually tested twice in `npm run dev` on macOS (real Steam login both times). Not yet tested on the Windows installer build.
**Next:** Step 2 (Steam Web API key entry + `safeStorage`).
**Blocked by:** nothing.

## 2026-09-20 (Milestone 2, Steps 2–4: API key, owned library, cover art)
**Built:** Step 2 (committed `9c96467`): `secret-store.ts` (safeStorage-backed encrypted key/value store, generic so Epic's tokens can reuse it), API key save/remove UI + `setApiKey`/`clearApiKey` IPC, `hasApiKey` wired into connection status. Step 3 (committed `9f89929`): `owned-games.ts` (`IPlayerService/GetOwnedGames/v1`, injectable HTTP deps, 15s timeout), `getOwnedGames` IPC (requires connection + API key), a "Your Steam Library" list. Step 4 (done, **uncommitted**): `library-cover-art.ts` (batches owned appIds through Steam's undocumented `IStoreBrowseService/GetItems` API to get each app's real cover-art filename), `coverUrl` attached to each owned game, a poster grid (`GameCoverArt.tsx`) matching docs/design/direction.md, CSP `img-src` widened to `shared.akamai.steamstatic.com`.
**Decisions:** Cover art took 3 iterations against the user's real library: a guessed fixed CDN path worked only for older titles (newer ones need a per-app content hash in the filename, not guessable); a guessed-then-fetched header-banner fallback worked but cropped badly. Settled on the same undocumented API the Steam client itself calls — flagged in code as riskier than the published `IPlayerService` API used elsewhere. Chunked lookups (100 ids/request) run with a max-4 concurrency cap given this codebase's prior Akamai/WAF blocking incident. Poster grid was built now, not deferred to Milestone 6, since cover art is this step's point; sidebar/filters still wait. Widened the page `max-w-3xl` → `max-w-6xl` and switched to a fluid `auto-fill`/`minmax` grid after the fixed layout left visible empty space.
**Fixed (one `/review` pass per step):** Step 2: a read-path bug that could silently delete an unrelated secret, a double-submit race on the API key form. Step 3: the owned-games list didn't refresh after reconnecting as a different Steam account (missing `steamId64` in the effect's deps), no cancellation guard for out-of-order responses, no fetch timeout. Step 4: a stale comment pointing at a deleted file, unbounded chunk concurrency (now capped).
**Verified:** All three steps tested live in `npm run dev` on macOS against the user's real Steam account — API key save/reload/remove, the owned-games list, and cover art (including titles needing the undocumented API's exact filename) all confirmed working. Not yet tested on the Windows installer.
**Next:** Commit Step 4, then Milestone 3.
**Blocked by:** nothing.
**Correction (added at the Milestone 3 close):** Step 4 was in fact committed, inside `34a780e` (the docs close commit), so nothing was left uncommitted.

## 2026-09-20 (Milestone 3: library cache + offline mode)
**Built:** 7 commits (`cac3b0e`..`1749c6f`), 24 files, 222 Vitest tests (73 before).
- `main/library/library-cache.ts`: versioned `library-cache.json`, per Steam account, zod-validated on read (cover URLs limited to Steam's asset host), write queue + temp-rename, cleared on disconnect.
- `main/library/cover-cache.ts` + `cover-protocol.ts`: covers saved to `covers/` (Steam host only, no redirects, 5 MB cap enforced while streaming, type from magic bytes, 4 at a time), stale files pruned, disconnect aborts and clears. Served by a read-only `app-cover://covers/<appId>` scheme (CSP `img-src` gained `app-cover:`).
- `getOwnedGames` now returns `{source: live|cache|none, games, problem}`. Typed `SteamApiError` (`offline`, `keyRejected` = 401/403 only, `unavailable`). Failures fall back to the saved copy and delete nothing; an empty live answer never replaces a non-empty saved library; overlapping calls share one request. New `getCachedLibrary` channel and a `steam:coversChanged` push.
- Renderer: instant load from cache, offline pill, per-problem notices, retry backoff (5 s, 15 s, 60 s) + "Try again", debounced `online` event, local covers swapped in mid-session. Pure tested helpers `library-problems.ts`, `library-view.ts`.
**Decisions:** Covers on disk + a custom protocol, so offline covers are real. Expected failures come back as data (Electron prefixes thrown IPC errors); the renderer owns all wording. Saved covers are never re-downloaded (delete `covers/` to refresh).
**Fixed by review:** empty body saved as a permanent blank cover; size cap not enforced while streaming; empty answer overwrote the saved library; stale "key rejected" notice after a key change; no retry if `online` never fires; cover downgrade race.
**Verified (macOS dev, real account):** relaunch shows the library instantly; forced-offline run (dead proxy) showed the pill, left saved data untouched, one retry per 60 s at steady state; with `covers/` emptied the grid went from 94 remote covers at +1 s to 94 local at +3 s; Reconnect Steam works. Not tested on the Windows installer.
**Next:** Milestone 4 (the sign-in `.catch` fix was done afterwards).
**Blocked by:** nothing. Open items: `setApiKey` still throws its message (Electron prefix); the renderer keeps the old list in memory after disconnect (no Disconnect button yet); `deriveLibraryView` extraction from `App.tsx`; real `fetchImage`/`writeFile`/`deleteFile` in `cover-cache.ts` untested; global `fetch` ignores system proxy settings; Windows installer test of M2 + M3.
