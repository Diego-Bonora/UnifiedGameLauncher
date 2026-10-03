# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4 are done and, by the user's report, work on Windows (CI installer from run 37133460579, 2026-10-03). Installed Epic games launch and show SteamGridDB posters with the user's own key; no Epic login or Epic owned library (Epic's terms, 2026-10-02). 432 tests.

## In Progress
Library layout redesign (spec in `docs/features/library-layout.md`): sidebar (All games / per store / Settings), full-width responsive grid, Installed + Library (not installed) sections, Steam install from the card, Settings screen. Spec written, awaiting review; no code yet.

## Next Up
Build the library layout. Then Milestone 6 (manual games, search, filters, favorites, sort by store). Milestone 5 (other launchers) moved to v2.

---

## 2026-10-03 (docs: scope fix)
**Decided:** Milestone 5 (GOG, Ubisoft, Battle.net, EA) moves to v2, matching spec.md's Out of Scope list; the roadmap in `docs/sources/PROJECT_PLAN.md` said otherwise. Milestone numbers stay (spec refers to Milestone 7), so v1 goes 4 → 6 → 7.
**Fixed:** Current State said the commits were not pushed; `main` already matched `origin/main`.
**Windows test (user, by hand, CI run 37133460579):** M2–M4 "everything seems to be working", including the Bloons TD 6 launch (opaque GUID AppName), so that open item is closed. No detailed checklist was recorded.
**User feedback:** the UI doesn't fit the window (page capped at `max-w-6xl`), installed Steam games are an old list, sections are scattered. This led to the library layout spec.

## 2026-10-02 (Epic covers from SteamGridDB, replacing Epic login)
**Decided:** Epic's Store EULA (2025-01-15) and ToS (2026-09-10) authorize no third-party clients; a library login means acting as Epic's launcher (EULA §2(c),(e)) and risks the user's account. So: no Epic login, covers from SteamGridDB with a user key, no owned-not-installed games, placeholder when no match (no title search), focus retries only after a failed sync. Spec: `docs/features/epic-covers.md`.
**Verified first (real requests):** `/grids/egs/{AppName}` (catalog ids 404); Bloons TD 6 linked to Steam only, so no cover; images on `cdn2.steamgriddb.com`; key = 32 hex; one request per game.
**Built:** Step 2 `main/library/` (`cover-files.ts` shared out of `cover-cache.ts`, `covers-epic/`, `steamgriddb.ts`, `epic-cover-state.ts`, `epic-cover-cache.ts`, `app-cover://epic/<AppName>`); Step 3 IPC (`epic-cover-handlers.ts`, `notify-windows.ts`, `coverUrl`); Step 4 renderer (`EpicCoverKeyForm.tsx`, `epic-cover-messages.ts`, upgrade-only covers, `GameCoverArt` retry token). 432 tests (278 before).
**Fixed by review:** 8 rounds before commit; four fixes needed a follow-up fix (see lessons.md).
**Verified (macOS dev, fixture `PROGRAMDATA`, real key):** Rocket League poster (820,839-byte PNG), Bloons placeholder + no-cover mark, form collapses, invalid key message. Not verified: failed-image retry; Windows.
**Blocked by:** nothing. Open: user to regenerate the SteamGridDB key (it was in the chat); `getSecret` reads a locked `secrets.json` as "no key" (Steam too); always-failing cover flashes per focus; `setApiKey` throws its message; no IPC sender check; Steam `getLaunchUrl` doesn't encode its id; cancelled sign-in doesn't abort its request; M3 open items (archive).

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
