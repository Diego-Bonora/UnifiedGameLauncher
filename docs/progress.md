# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 3 (library cache + offline mode) is done, committed (`cac3b0e`..`1749c6f`) and verified in the macOS dev app, including a forced-offline run. Nothing is uncommitted. Windows installer testing for Milestones 2 and 3 is still outstanding.

## In Progress
Nothing active.

## Next Up
Fix the missing `.catch` in the Steam sign-in verification (`openid.ts:157`, see the open items below), reviewed before committing, then start Milestone 4 (Epic: installed detection + launch first).

---

## 2026-09-20 (Milestone 3: library cache + offline mode)
**Built:** 7 commits (`cac3b0e`..`1749c6f`), 24 files, 222 Vitest tests (73 before).
- `main/library/library-cache.ts`: versioned `library-cache.json`, per Steam account, zod-validated on read (cover URLs limited to Steam's asset host), write queue + temp-rename, cleared on disconnect.
- `main/library/cover-cache.ts` + `cover-protocol.ts`: covers saved to `covers/` (Steam host only, no redirects, 5 MB cap enforced while streaming, type from magic bytes, 4 at a time), stale files pruned, disconnect aborts and clears. Served by a read-only `app-cover://covers/<appId>` scheme (CSP `img-src` gained `app-cover:`).
- `getOwnedGames` now returns `{source: live|cache|none, games, problem}`. Typed `SteamApiError` (`offline`, `keyRejected` = 401/403 only, `unavailable`). Failures fall back to the saved copy and delete nothing; an empty live answer never replaces a non-empty saved library; overlapping calls share one request. New `getCachedLibrary` channel and a `steam:coversChanged` push.
- Renderer: instant load from cache, offline pill, per-problem notices, retry backoff (5 s, 15 s, 60 s) + "Try again", debounced `online` event, local covers swapped in mid-session. Pure tested helpers `library-problems.ts`, `library-view.ts`.
**Decisions:** Covers on disk + a custom protocol, so offline covers are real. Expected failures come back as data (Electron prefixes thrown IPC errors); the renderer owns all wording. Saved covers are never re-downloaded (delete `covers/` to refresh).
**Fixed by review:** empty body saved as a permanent blank cover; size cap not enforced while streaming; empty answer overwrote the saved library; stale "key rejected" notice after a key change; no retry if `online` never fires; cover downgrade race.
**Verified (macOS dev, real account):** relaunch shows the library instantly; forced-offline run (dead proxy) showed the pill, left saved data untouched, one retry per 60 s at steady state; with `covers/` emptied the grid went from 94 remote covers at +1 s to 94 local at +3 s; Reconnect Steam works. Not tested on the Windows installer.
**Next:** the sign-in `.catch` fix, then Milestone 4.
**Blocked by:** nothing. Open items: `openid.ts:157` `verifySteamOpenIdResponse(...).then(...)` has no `.catch`, so a network failure at the sign-in callback is an unhandled rejection and the sign-in hangs until its timeout; `setApiKey` still throws its message (Electron prefix); the renderer keeps the old list in memory after disconnect (no Disconnect button yet); `deriveLibraryView` extraction from `App.tsx`; real `fetchImage`/`writeFile`/`deleteFile` in `cover-cache.ts` untested; global `fetch` ignores system proxy settings; Windows installer test of M2 + M3.

## 2026-09-20 (Milestone 2, Steps 2–4: API key, owned library, cover art)
**Built:** Step 2 (committed `9c96467`): `secret-store.ts` (safeStorage-backed encrypted key/value store, generic so Epic's tokens can reuse it), API key save/remove UI + `setApiKey`/`clearApiKey` IPC, `hasApiKey` wired into connection status. Step 3 (committed `9f89929`): `owned-games.ts` (`IPlayerService/GetOwnedGames/v1`, injectable HTTP deps, 15s timeout), `getOwnedGames` IPC (requires connection + API key), a "Your Steam Library" list. Step 4 (done, **uncommitted**): `library-cover-art.ts` (batches owned appIds through Steam's undocumented `IStoreBrowseService/GetItems` API to get each app's real cover-art filename), `coverUrl` attached to each owned game, a poster grid (`GameCoverArt.tsx`) matching docs/design/direction.md, CSP `img-src` widened to `shared.akamai.steamstatic.com`.
**Decisions:** Cover art took 3 iterations against the user's real library: a guessed fixed CDN path worked only for older titles (newer ones need a per-app content hash in the filename, not guessable); a guessed-then-fetched header-banner fallback worked but cropped badly. Settled on the same undocumented API the Steam client itself calls — flagged in code as riskier than the published `IPlayerService` API used elsewhere. Chunked lookups (100 ids/request) run with a max-4 concurrency cap given this codebase's prior Akamai/WAF blocking incident. Poster grid was built now, not deferred to Milestone 6, since cover art is this step's point; sidebar/filters still wait. Widened the page `max-w-3xl` → `max-w-6xl` and switched to a fluid `auto-fill`/`minmax` grid after the fixed layout left visible empty space.
**Fixed (one `/review` pass per step):** Step 2: a read-path bug that could silently delete an unrelated secret, a double-submit race on the API key form. Step 3: the owned-games list didn't refresh after reconnecting as a different Steam account (missing `steamId64` in the effect's deps), no cancellation guard for out-of-order responses, no fetch timeout. Step 4: a stale comment pointing at a deleted file, unbounded chunk concurrency (now capped).
**Verified:** All three steps tested live in `npm run dev` on macOS against the user's real Steam account — API key save/reload/remove, the owned-games list, and cover art (including titles needing the undocumented API's exact filename) all confirmed working. Not yet tested on the Windows installer.
**Next:** Commit Step 4, then Milestone 3.
**Blocked by:** nothing.
**Correction (added at the Milestone 3 close):** Step 4 was in fact committed, inside `34a780e` (the docs close commit), so nothing was left uncommitted.

## 2026-09-20 (Milestone 2, Step 1: Steam OpenID sign-in)
**Built:** `app/src/main/stores/steam/openid.ts` (OpenID 2.0 `checkid_setup`/`check_authentication` flow — see Decisions), `app/src/main/storage/connection-store.ts` (plain-JSON `connections.json`, read-merge-write behind a write queue, `SteamConnection` as a discriminated union), `app/src/main/ipc/steam-auth.ts` (`signIn`/`cancelSignIn`/`disconnect`/`getConnectionStatus` handlers). Extended `shared/ipc/steam-channels.ts`/`steam.ts`, `preload/index.ts`, `shared/api.ts`. `App.tsx` gained a "Connect Steam"/"Reconnect Steam" button, a "waiting for your browser" state with Cancel, and shows the connected SteamID64. 38 Vitest tests total (11 in `openid.test.ts`, including a real loopback-server integration test for the original race condition).
**Decisions:** Steam's login page opens in the user's **system browser** (`shell.openExternal`), not an embedded `BrowserWindow` — the embedded approach was tried first and got hard-blocked by Steam's Akamai WAF (see docs/lessons.md); a real loopback HTTP server on `127.0.0.1` (ephemeral port) catches the callback instead, like `gh auth login`. `electron-store` was **not** added as a dependency; `connections.json` is hand-rolled plain JSON with the same injectable-deps test pattern as M1, since it's not a secret.
**Fixed (two `/review` passes):** Round 1 found and fixed a real race condition (a cancelled flow's delayed verification could clobber a newer flow's state), a missing anti-CSRF binding on the loopback callback, a redundant zod re-validation, and no feedback/logging on failure paths. Round 2 confirmed those and fixed a concurrent-writer race in `connection-store.ts` (write queue) and unlogged write errors.
**Verified:** Manually tested twice in `npm run dev` on macOS (real Steam login both times). Not yet tested on the Windows installer build.
**Next:** Step 2 (Steam Web API key entry + `safeStorage`).
**Blocked by:** nothing.
