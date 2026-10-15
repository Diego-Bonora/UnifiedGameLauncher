# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4, the library layout and all of Milestone 6 are on `main` (`755ce03`, 709 tests), including the new "★ Favorites" / "All" sub-groups. The user's Windows test of Milestone 6 is half done: search, Add game, launch, Steam cover, Rename, Change .exe and Exe icon work. The current installer is from run 38780888761. Xbox app games can't be manual games; they are a v2 store (draft spec `docs/features/xbox-store.md`).

## In Progress
The rest of the Windows test of Milestone 6, with the installer from run 38780888761.

## Next Up
Finish the Windows test: Favorites sub-groups; launch arguments (Notepad + `"C:\Test Folder\hello.txt"`, native confirmation); `C:\Windows\regedit.exe` (expect "Windows wouldn't start…"); `ipconfig.exe` (console limit); Remove. Fix what it finds, then Milestone 7.

---

## 2026-10-15 (Windows test of Milestone 6, Xbox v2 spec, Favorites sub-groups)
**Windows test (user, installer run 38766994554):** works: search, Add game (Overwatch, path with spaces), launch, Steam cover by exact title, Rename, Change .exe, Exe icon switch. Found: Minecraft Launcher in `C:\XboxGames\…\Content` can't be picked (Windows permission error in the file dialog itself, not the app).
**Xbox (v2, docs only, `8881575`):** `docs/features/xbox-store.md` (draft) + real samples in `docs/sources/xbox-samples/`. Verified on the user's PC: `.GamingRoot` format (`RGBX`, count, UTF-16LE names), `Content\MicrosoftGame.config` readable (title, package name, StoreId), app ID via `Get-StartApps`, `explorer.exe "shell:AppsFolder\<app id>"` launches, displaycatalog Poster 1440×2160 without a key. Spec review settled: card id = package name, launch only if Windows' package record matches the folder, `explorer.exe` by full path, no `shell:` on the allow-list, sender check, per-drive failures; 13 open items each with one check.
**Built (`0d05510` spec, `755ce03` code, 709 tests):** Favorites sub-groups (user's call): a section showing a starred game splits into "★ Favorites" above "All" (h3; drawn star `aria-hidden`; heading rows `role="none"` so the list counts only games, user's call (a)). `game-cards.ts` `sectionItems` (one keyed list, cards moved not rebuilt), `LibraryScreen.tsx`, `GameTile.tsx` (`StarIcon` exported), `use-favorites.ts` (`loaded`; sections wait for it, no unsplit-then-split jump).
**Fixed by review:** spec review (11 findings, e.g. focus lost when a card changes group, rebuild of every card on the first star, startup jump) folded into the spec; code review clean.
**Verified (headless dev app + CDP):** star/unstar by keyboard keeps focus and recreates no card; last star removes the headings; search without a starred match shows none. Not verified on Windows yet.
**Next:** the rest of the Windows test.
**Blocked by:** nothing. Open: the 2026-10-15 Step 4b items below; Xbox open items in its spec.

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
