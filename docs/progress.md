# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 2 (Steam sign-in, API key, owned library, cover art) is functionally complete and manually verified end-to-end in the macOS dev app against a real Steam account. Steps 1–3 are committed; Step 4 (cover art) is done and reviewed but **not yet committed** — its diff is sitting in the working tree.

## In Progress
Nothing active. Step 4 just needs a commit.

## Next Up
Commit Step 4, then start Milestone 3 (library cache + offline mode). Windows installer testing for all of Milestone 2 is still outstanding.

---

## 2026-09-20 (Milestone 2, Steps 2–4: API key, owned library, cover art)
**Built:** Step 2 (committed `9c96467`): `secret-store.ts` (safeStorage-backed encrypted key/value store, generic so Epic's tokens can reuse it), API key save/remove UI + `setApiKey`/`clearApiKey` IPC, `hasApiKey` wired into connection status. Step 3 (committed `9f89929`): `owned-games.ts` (`IPlayerService/GetOwnedGames/v1`, injectable HTTP deps, 15s timeout), `getOwnedGames` IPC (requires connection + API key), a "Your Steam Library" list. Step 4 (done, **uncommitted**): `library-cover-art.ts` (batches owned appIds through Steam's undocumented `IStoreBrowseService/GetItems` API to get each app's real cover-art filename), `coverUrl` attached to each owned game, a poster grid (`GameCoverArt.tsx`) matching docs/design/direction.md, CSP `img-src` widened to `shared.akamai.steamstatic.com`.
**Decisions:** Cover art took 3 iterations against the user's real library: a guessed fixed CDN path worked only for older titles (newer ones need a per-app content hash in the filename, not guessable); a guessed-then-fetched header-banner fallback worked but cropped badly. Settled on the same undocumented API the Steam client itself calls — flagged in code as riskier than the published `IPlayerService` API used elsewhere. Chunked lookups (100 ids/request) run with a max-4 concurrency cap given this codebase's prior Akamai/WAF blocking incident. Poster grid was built now, not deferred to Milestone 6, since cover art is this step's point; sidebar/filters still wait. Widened the page `max-w-3xl` → `max-w-6xl` and switched to a fluid `auto-fill`/`minmax` grid after the fixed layout left visible empty space.
**Fixed (one `/review` pass per step):** Step 2: a read-path bug that could silently delete an unrelated secret, a double-submit race on the API key form. Step 3: the owned-games list didn't refresh after reconnecting as a different Steam account (missing `steamId64` in the effect's deps), no cancellation guard for out-of-order responses, no fetch timeout. Step 4: a stale comment pointing at a deleted file, unbounded chunk concurrency (now capped).
**Verified:** All three steps tested live in `npm run dev` on macOS against the user's real Steam account — API key save/reload/remove, the owned-games list, and cover art (including titles needing the undocumented API's exact filename) all confirmed working. Not yet tested on the Windows installer.
**Next:** Commit Step 4, then Milestone 3.
**Blocked by:** nothing.

## 2026-09-20 (Milestone 2, Step 1: Steam OpenID sign-in)
**Built:** `app/src/main/stores/steam/openid.ts` (OpenID 2.0 `checkid_setup`/`check_authentication` flow — see Decisions), `app/src/main/storage/connection-store.ts` (plain-JSON `connections.json`, read-merge-write behind a write queue, `SteamConnection` as a discriminated union), `app/src/main/ipc/steam-auth.ts` (`signIn`/`cancelSignIn`/`disconnect`/`getConnectionStatus` handlers). Extended `shared/ipc/steam-channels.ts`/`steam.ts`, `preload/index.ts`, `shared/api.ts`. `App.tsx` gained a "Connect Steam"/"Reconnect Steam" button, a "waiting for your browser" state with Cancel, and shows the connected SteamID64. 38 Vitest tests total (11 in `openid.test.ts`, including a real loopback-server integration test for the original race condition).
**Decisions:** Steam's login page opens in the user's **system browser** (`shell.openExternal`), not an embedded `BrowserWindow` — the embedded approach was tried first and got hard-blocked by Steam's Akamai WAF (see docs/lessons.md); a real loopback HTTP server on `127.0.0.1` (ephemeral port) catches the callback instead, like `gh auth login`. `electron-store` was **not** added as a dependency; `connections.json` is hand-rolled plain JSON with the same injectable-deps test pattern as M1, since it's not a secret.
**Fixed (two `/review` passes):** Round 1 found and fixed a real race condition (a cancelled flow's delayed verification could clobber a newer flow's state), a missing anti-CSRF binding on the loopback callback, a redundant zod re-validation, and no feedback/logging on failure paths. Round 2 confirmed those and fixed a concurrent-writer race in `connection-store.ts` (write queue) and unlogged write errors.
**Verified:** Manually tested twice in `npm run dev` on macOS (real Steam login both times). Not yet tested on the Windows installer build.
**Next:** Step 2 (Steam Web API key entry + `safeStorage`).
**Blocked by:** nothing.

## 2026-09-20 (Milestone 1: Steam installed games)
**Built:** `src/main/stores/store-provider.ts` (shared `StoreProvider` interface). `src/main/stores/steam/`: `vdf.ts` (Valve KeyValues parser), `app-manifest.ts`, `library-folders.ts`, `steam-registry.ts` (`reg query`-based `SteamPath` lookup), `steam-provider.ts`, `index.ts` — each with a `*.test.ts` beside it (20 tests total). `src/shared/ipc/steam-channels.ts` (zero-dependency channel names/types) and `steam.ts` (main-only zod schemas). `src/main/ipc/steam.ts` (the `getInstalledGames`/`launch` handlers). Preload/renderer wiring. New `app/scripts/check-preload-deps.mjs`, wired into `npm run build`.
**Decisions:** Registry access shells out to `reg query` via `child_process.execFile` instead of a native registry package. One VDF parser reused for both `.vdf`/`.acf` files. `getLaunchUrl` returns a URL string instead of launching directly, keeping the `steam://` allow-list check centralized in the IPC handler.
**Fixed:** A real bug the user caught live — the sandboxed preload can only `require()` a small Electron built-in allowlist, not npm packages; a `zod` import reached it transitively and blanked the whole window. Fixed by splitting channel names/types (zero deps) from zod schemas (main-only). Two `/review` passes fixed a mislabeled IPC field, a silently-swallowed Play-button failure, a decorative zod schema never enforced, and added `check-preload-deps.mjs`.
**Verified:** Committed as `c92bd09`, pushed, CI green. Installed on the Windows PC: list shows each detected Steam game with a Play button, launches through Steam.
**Next:** Milestone 2 (Steam sign-in + owned library + cover art).
**Blocked by:** nothing.
