# Progress

> Full history in docs/progress-archive.md

## Current State
Milestones 0–4, the library layout and Milestone 6 are on `main`. Milestone 7 (release) has a reviewed spec, `docs/features/release.md`. Its Step 1 is done (738 tests): bug fixes, Disconnect Steam, typed Steam results, and a sender check on every IPC channel. The Milestone 6 Windows test is still half done (installer run 38780888761); it is a separate task now, not part of Milestone 7.

## In Progress
Milestone 7, one step at a time: 2) About + privacy policy + licenses, 3) app icon, 4) auto-updates, 5) release workflow, 6) Windows test of the release path.

## Next Up
Milestone 7 Step 2: the About group in Settings, the privacy policy, `LICENSE` and the generated components list (spec sections 1–3).

---

## 2026-10-17 (Milestone 7 spec and Step 1)
**Decided (spec `docs/features/release.md`, user's calls):**
- **Release basics:** v1 keeps the name UnifiedGameLauncher and ships under MIT.
- **Updates:** the app asks before downloading. A Settings switch is on by default; an unreadable `settings.json` counts as off.
- **About and privacy:** About + privacy go at the bottom of Settings. Copy link goes through a main IPC with no arguments; no `https://` is added to the allow-list.
- **Release flow:** CI uploads to a draft release on a `v*` tag. The test releases are 0.9.0 → 0.9.1, then 1.0.0. `appId`, the package name and the repo are kept for good.
- **Disconnect** deletes account data only (Steam ID, saved library, covers of games not in the latest installed read); the key and favorites stay.
- **Spec review (16 findings, folded in):** `autoDownload` must be switched off; the privacy draft was inaccurate (updater cache in `%LOCALAPPDATA%`, no installed list saved); some bundled licenses aren't MIT; the updater states and CI edge cases were missing.

**Built (738 tests, 709 before):**
- `manual-covers.ts`: Change .exe to an exe without an icon drops the old icon. A folder that can't be listed stops the sync.
- `cover-files.ts` `listCoverFilesIn` rejects on anything but ENOENT; each caller decides what that means.
- Typed `SteamConnectResult`, `SteamSetApiKeyResult`, `SteamDisconnectResult`; wording in new `steam-messages.ts`.
- Disconnect:
  - `steam-auth.ts`: data first, connection last, stays connected on failure.
  - The `disconnectGeneration` counter is taken before the state read; `waitForDisconnects()` loops; a read overtaken by a disconnect saves nothing.
  - `cover-cache.ts`: `latestInstalled` decides what `clearCovers` keeps.
  - UI: `DisconnectSteamDialog.tsx`, the button and focus return in `SettingsScreen.tsx`, `'done' | 'failed' | 'busy'` in `use-steam-library.ts`.
- `ipc/app-handle.ts` `handleFromApp` (the sender check, moved from `manual.ts`) now wraps every handler in steam, steam-auth, epic, favorites and manual.
- `dialog-buttons.ts`: shared button styles.

**Fixed by review (3 rounds, last clean):** a read already checking the connection still saved the library after Disconnect; covers of games uninstalled this session survived it; a stuck error line; a second click closed the dialog; no sender check outside manual games.

**Verified:**
- **Dev app (macOS, CDP):** the dialog survives StrictMode; Esc and Cancel return focus; a real Disconnect deletes the Steam ID and library and keeps the key (dev data backed up and restored).
- **Dev app and production build (`file://`):** the Steam, Epic, favorites and manual calls pass the sender check.
- **Not verified:** installed covers surviving Disconnect on a real PC (no Steam games on the Mac); that is Windows test item 7.

**Next:** Step 2 (About, privacy, licenses).
**Blocked by:** nothing. Open: the Milestone 6 Windows test items; the spec's open items (SmartScreen during an update, the single-instance lock after Restart now, the sha512 / missing `latest.yml` behaviour, to be read in step 4); older open items in progress-archive.md.

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
**Blocked by:** nothing. Open: the stale icon after Change .exe and the sync's unlistable-folder read were both fixed on 2026-10-17.
