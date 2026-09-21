# Progress

> Full history in docs/progress-archive.md

## Current State
Milestone 4 stage 1 (Epic installed detection + launch, no login) is done and committed; on 2026-09-21 the launch URL and manifest shape were confirmed by hand on one real Windows 11 PC. Stage 2 (Epic login, owned library, covers) is researched but undecided. The app itself has not run on Windows: Milestones 2–4 are verified on macOS only. Code is committed locally (5 commits, `07344ee`..`e018d9a`) and not yet pushed.

## In Progress
Nothing active.

## Next Up
Read Epic's EULA (it couldn't be fetched), then decide stage 2: login + library + covers together, or leave Epic on placeholders (SteamGridDB covers is an untested alternative). After the push, run the CI "Build installer" and test Milestones 2–4 on the Windows PC.

---

## 2026-09-21 (Epic Windows check + stage 2 research)
**Windows check (by hand, one PC, Windows 11 build 26200, launcher under `C:\Program Files\Epic Games\`):** `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true` started Rocket League (AppName `Sugar`) from a cold launcher, so the plain `AppName` URL form is confirmed and the longer `namespace:itemId:appName` form wasn't needed. Only one game was launched; Bloons TD 6 (opaque GUID AppName) was not.
**Real manifests corrected an assumption:** base games have an EMPTY `MainGameAppName`, not one equal to `AppName` (my fixtures had it wrong; the parser already treated empty as "no information"). Titles keep `®`; paths are backslashes; categories can lack `"public"`. Fixtures now use the real shape and there are tests built from the two real manifests (278 tests). Not verified: a real DLC manifest (none installed); manifests also carry `MainGameCatalogItemId`/`MainGameCatalogNamespace` if the current DLC check ever misses.
**Stage 2 research (no code, public sources only):** (1) Epic's official login (Epic Account Services OAuth) has only `basic_profile`, `friends_list`, `presence` scopes, so it cannot list a library, and needs a client secret that can't be bundled. (2) Community launchers log in with Epic's own public launcher client id (browser login, authorization code, token exchange, then library/catalog endpoints); that means presenting as Epic's launcher, the code likely has to be pasted (loopback probably doesn't work), and token lifetimes are unknown (one community doc lists 2 h access / 8 h refresh for a Fortnite client). (3) Cover lookup without login does not work: the public storefront GraphQL answered a Cloudflare browser challenge (HTTP 403) to a plain client, and the launcher catalog service (namespace + item ids, which the manifests carry) answered 401. Real Epic covers need the stage 2 login. (4) Epic's EULA could not be read (legal pages redirect to a login), so the terms question is open. Untested alternative for login-free covers: SteamGridDB with a user-supplied key.
**Next:** decide stage 2 (login + library + covers), or leave Epic on placeholders.
**Blocked by:** nothing. Open items: app not run on Windows; Bloons-style opaque AppName launch unverified; DLC detection unverified on a real DLC manifest; Epic EULA unread; whether a manifest's `CatalogItemId` matches the launcher catalog's item id (needs a login to test); plus the items in the Milestone 4 stage 1 entry below.

## 2026-09-20 (Milestone 4, stage 1: Epic installed detection + launch)
**Built:** 3 commits (`f75c4f2`, `dcb2d40`, `c0e6bf1`), 274 Vitest tests (225 before).
- Step 1, `main/stores/epic/`: `epic-manifest.ts` parses `Data/Manifests/*.item` into `game` / `skipped` / `invalid` (DLC, non-games and half-finished installs are skipped quietly; only broken files warn). `InstallLocation` must be a local drive path, titles are cleaned, ids limited to `[A-Za-z0-9_-]`. `epic-provider.ts` reads `%PROGRAMDATA%` with an injectable fs. `InstalledGame` gained optional `catalogNamespace` / `catalogItemId`.
- Step 2, IPC: `shared/ipc/epic-channels.ts` (preload-safe) + `epic.ts` (zod), logic in `main/ipc/epic-handlers.ts` (no Electron import, fully tested), thin `epic.ts` wiring. Launch only accepts games detected right now and re-checks the URL against the allow-list. Expected failures come back as data (`notInstalled`, `launcherUnavailable`).
- Step 3, renderer: `EpicInstalledSection` (own list, launch and message state), `EpicGameTile` (2:3 poster tile, the whole tile is the play button), `GameCoverArt` got an optional `placeholderLabel`, pure tested `epic-view.ts` and `epic-launch-messages.ts`.
**Decisions:** Launch URL is `apps/<AppName>?action=launch&silent=true` from the project plan, unverified; catalog ids are carried but not used yet. Poster tiles now (not rows), since covers are coming; until then a tile shows the title on a placeholder. No visible Play button: the card is the button (user's call). After a launch is accepted the tiles pause for 5 s with a "Starting…" line, because the hand-off returns long before the game window appears. Epic messages live in the Epic section, not the shared Steam launch line. The list reloads on window focus and keeps the old list if a refresh fails.
**Fixed by review (2 rounds per step 1 and 2, 1 for step 3):** non-games and engines warned as corrupt; UNC and relative install paths accepted; a rejected `openExternal` reached the renderer as a raw error; a failed detection on launch did too; a failed focus refresh wiped the list; no feedback after a successful launch; badge slid against the lifted cover; the error line wasn't announced to screen readers.
**Verified (macOS dev, `PROGRAMDATA` pointed at a fixture):** 5 tiles for 7 manifests (a DLC and an engine skipped), sorted by title; clicking a tile showed the friendly "Could not open the Epic Games launcher" message while the raw macOS error stayed in the main-process log. Not seen in the window: hover lift, the 5 s pause, the "Starting…" line. Not tested on Windows.
**Next:** Windows check of the launch URL, then stage 2 (login + owned library).
**Blocked by:** nothing. Open items: Epic covers need stage 2; IPC handlers do no sender/frame check (Steam neither; one window today); Steam's `getLaunchUrl` doesn't encode its id (its IPC schema allows digits only); a sign-in cancelled mid-verification doesn't abort its Steam request; the Milestone 3 open items (entry now in the archive) still stand (`setApiKey` throws its message, stale list after disconnect, `deriveLibraryView` extraction, untested real cover-cache I/O, `fetch` ignores system proxy, Windows installer test of M2 + M3).

## 2026-09-20 (Steam sign-in verification fix)
**Built:** `openid.ts` loopback callback is now an async `handleCallback`. A network failure, timeout or Steam 5xx while verifying resolves the sign-in as `{ failed: true }` and shows the failure page, instead of an unhandled rejection that hung until the 5-minute timeout. 3 new tests (225 total).
**Decisions:** `settle()` runs before the response is written (write in try/catch); the tab shows "signed in" only if this flow still accepted the result; a per-flow `handled` flag verifies only the first callback (later ones get 409); the verification `fetch` has a 15 s timeout and throws on non-2xx. Offline and rejected login still share one message; a `reason: 'network'` variant is deferred to Epic's login (Milestone 4).
**Fixed by review:** two `/review` passes. Round 1 found the write-before-settle hang, wrong page after cancel, double-callback failure, no timeout, weak test. Round 2 found nothing.
**Not done (optional):** a flow cancelled mid-verification does not abort its Steam request (result is discarded).
**Next:** Milestone 4.
