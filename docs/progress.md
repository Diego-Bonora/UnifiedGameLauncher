# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4, the library layout and all of Milestone 6 are built and on `main` (`588ad7f`, 704 tests): search, a favorite star, and manual games (a "Manual" store: add an .exe, rename, launch arguments confirmed in a native dialog, Change .exe, remove, and a per-game Cover choice: Steam poster by exact title or the exe's icon). Milestone 6 is untested on Windows.

## In Progress
Nothing. Waiting for the user's Windows test of Milestone 6.

## Next Up
The Windows test of Milestone 6 (installer from run 38766994554): search, stars, Add game (path with spaces, `.lnk` refused), arguments + native confirmation, Change .exe, Remove, Steam cover vs Exe icon, an admin-only and a console exe. Then Milestone 7.

---

## 2026-10-15 (Milestone 6 Step 4b: manual covers on the cards; merged to main)
**Found at /start:** Milestone 6 lived only on `claude/epic-clarke-xvw1eb`, not `main`; fast-forwarded to it (see lessons.md).
**Built (`588ad7f`, 704 tests, 687 before):**
- Renderer: `game-cards.ts` (`iconUrl`; poster only with Steam cover), `GameCoverArt.tsx` (32 px exe icon on the placeholder), `ManualGameMenu.tsx` ("Cover" `menuitemradio` group), `use-manual-actions.ts` (`setCover`), `manual-messages.ts`, `use-manual-games.ts` (`onCoversChanged`), new `manual-view.ts`.
- Preload/shared: `setCoverSource`, `onCoversChanged`, `ManualGamesList.coversReadable`.
- Main: `covers.urls()` throws when the folder can't be listed (ENOENT = no covers) or a game's own cover file can't be `stat`ed (`mtimeMs: null`; the sync still sees it), giving `coversReadable: false`.
**Decisions:** the window keeps shown covers only when main says `coversReadable: false`; otherwise main's nulls are the truth (a poster main drops on purpose must disappear), and a rename still drops the poster. A manual change's answer is shown unless a newer change started (`latestChangeRef`), and the list is read again if a read overtook it. Merged to `main` by fast-forward (user's call).
**Fixed by review (3 rounds):** a covers reload could hide a saved change; the renderer guessed why a URL was null; one locked unrelated file stopped all cover updates. Last fix not re-reviewed (user's call).
**Verified (headless dev app + CDP, seeded games):** each cover kind; menu by keyboard; switching both ways; a re-read icon reaches the window with no loop; an unlistable folder keeps shown covers. Not verified: a real Steam poster (proxy blocks Steam); the overtaken-change fix live (needs clicking main's native dialog; no xdotool here).
**Next:** the Windows test of Milestone 6.
**Blocked by:** nothing. Open: after Change .exe to an exe with no readable icon, main keeps showing the old exe's icon (pre-existing, in `manual-covers.ts`); the sync's own `listFiles()` still treats an unlistable folder as empty (pre-existing); older items below.

## 2026-10-03 (Milestone 6: search, favorites, manual games, manual covers in main)
**Decided (spec `docs/features/library-tools.md`, user's calls):** "sort by store" = the sidebar views plus a new **Manual** store; filters = one search box per view (shared query); favorites = a star that pins to the top (no Favorites view); manual covers = per-game choice **Steam cover** (exact-title Steam match, falls back to the exe icon) or **Exe icon** (title never sent). New launch arguments are saved only after main's own native confirmation dialog; an exe refused by Windows (incl. admin-only) gets a "run as administrator" message. `StoreProvider` split into `UrlStoreProvider` (Steam, Epic) and `DirectStoreProvider` (Manual). Steam store search verified with one plain request from the user's Mac (keyless; fixture `stores/manual/fixtures/storesearch-hollow-knight.json`).
**Built (5 feature commits, `0349cd6`..`72ffa4c`, 687 tests, 509 before):**
- 1 search: `game-search.ts`, `SearchBox.tsx`. 2 favorites: `favorites-store.ts`, `use-favorites.ts`, star in `GameTile`.
- 3a main: `stores/manual/` (file, `exe-path`, `manual-launch` verbatim args), `manual-handlers.ts`, `manual.ts`, `security/ipc-sender.ts`. 3b UI: `ModalDialog`, `ManualGameDialogs`, `ManualGameMenu`, `use-manual-actions`, `manual-messages`.
- 4a covers in main: `steam-title-search.ts`, `manual-covers.ts` (once per session, miss per title), `setCoverSource`, `coversChanged`. Privacy draft line added.
**Fixed by review (~60 findings, every fix re-reviewed):** e.g. hidden characters could fake the args dialog; dialogs closed themselves in dev (StrictMode); a locked list file looped icon rewrites.
**Verified (Linux container, headless Electron + CDP):** search, stars, manual launch with args, menu/dialog keyboard paths, icons. Steam is blocked by this container's proxy.
**Next:** Step 4b, then the Windows test (args dialog, path with spaces, .lnk refused, admin-only and console exes).
**Blocked by:** nothing. Open: admin-only exe error code (EACCES expected); console exes have no window; icons are 32 px; older items below.

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
