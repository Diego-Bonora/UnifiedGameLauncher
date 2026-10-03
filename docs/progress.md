# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4 and the new library layout work on Windows (user-tested, CI runs 37141641404, 37145505283). The app has a sidebar (All games / Steam / Epic / Settings, ☰ drawer under 768 px), full-width 2:3 poster grids split into Installed and Library (owned, not installed), Play/Install from the card, and a Settings screen for the Steam sign-in, Steam key and SteamGridDB key. Installed Steam games that aren't owned (free-to-play, Family Sharing) get covers from Steam's cover service. Pushed up to `42d94c7`; 509 tests.

## In Progress
Nothing active.

## Next Up
Milestone 6: manual games, search, filters, favorites, sort by store (filters/favorites can go in the sidebar). Milestone 5 is v2.

---

## 2026-10-03 (scope fix, library layout redesign, installed-game covers)
**Decided:** Milestone 5 moves to v2 to match spec.md (numbering kept: v1 is 4 → 6 → 7). New spec `docs/features/library-layout.md` after the user's Windows test of M2–M4 ("UI doesn't fit the window"): sidebar from one store list (`shared/stores.ts`), Installed + Library per view (Epic view has no Library), whole card plays/installs (`steam://install/<appid>`), one app-wide 5 s pause and message line, Settings screen, opens on All games. User's calls: Steam non-games stay listed; an unreadable drive at startup is a known limit.
**Built (6 commits, `e08b537`..`42d94c7`, 509 tests, 432 before):**
- Step 1 (main/shared): `scanInstalledSteamGames` reports unreadable library folders (a gone Steam drive or failed `reg` query is a failed read, not "no games"); `libraryKey` normalizes paths; `steam-handlers.ts` (no Electron import): launch/install return `{ accepted }` as data, Epic's result renamed to match; `steam:install` channel (zod, digits only); URL builders encode ids.
- Step 2 (renderer state): `use-steam-library`, `use-epic-library`, `use-hand-off` hold all state app-wide; tested helpers `steam-installed.ts` (keep games on unreadable drives), `game-cards.ts` (sections per view, `store:id` keys, shared collator), `hand-off.ts` (all wording).
- Step 3: `Sidebar.tsx`, `navigation.ts`, `SettingsScreen.tsx`, shell in `App.tsx` (drawer with inert content, focus return); key actions + busy flags moved into the hooks.
- Step 4: `GameTile.tsx`, `GameSection.tsx`, `LibraryScreen.tsx` rebuilt (focus to a section heading when a focused card moves or goes); old Epic section/tile deleted.
- Covers fix: installed Steam games not in the owned list (Brawlhalla, Warframe, Unturned free-to-play; Forager family-shared) are looked up via `IStoreBrowseService/GetItems` (no key; one plain request checked first), once per session, 60 s backoff, cancellable; the owned cleanup keeps covers of games seen installed this session; Steam cards get a cover retry token.
**Fixed by review:** each step got a review plus a review of its fixes (≈25 findings), e.g. a gone Steam drive read as "no games", Install offered before the installed list loaded, an 85 ms re-sort per click.
**Verified:** macOS dev via CDP screenshots (columns follow the width, drawer focus/Esc, install message, focus after a removed card); Windows by the user (layout, play, install, the four covers).
**Next:** Milestone 6.
**Blocked by:** nothing. Open: `SteamPath` spelling and `reg` exit code 1 unverified on Windows; whether `openExternal` rejects when nothing handles `steam://` (Epic's `launcherUnavailable` too); a sign-in finishing before the first connection read can be overwritten by it; "Open Settings" focus untried in the app; a leftover Steam registry key keeps old games for the session; Node 20 actions in CI; user to rotate the SteamGridDB key; older items in the 2026-10-02 entry.

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
