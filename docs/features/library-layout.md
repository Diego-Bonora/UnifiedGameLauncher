# Library Layout

Decided 2026-10-03, after the first Windows test. Replaces the single-page stack of forms, the Steam grid, the old installed-Steam list and the separate Epic section.

## Problem
- On a wide window the grid stops at about 7 columns, because the page is capped at a fixed width.
- Installed Steam games show as an old text list with Play buttons instead of covers.
- The Steam and Epic sections are separate, and the sign-in and key forms push the covers down the page.
- There is no way to see one store's games on their own.

## Shell
A left **sidebar** and a **content area**. Views are switched in the renderer (no router). The app always opens on **All games**; the last view is not remembered.

### Sidebar
From top to bottom:
1. The app name (`APP_NAME`).
2. **All games**: every store together.
3. One entry per supported store, in a fixed order: **Steam**, **Epic** (later integrations add theirs).
4. **Settings**, pinned to the bottom.

- The store entries come from one list of supported stores in `src/shared`. Each entry holds the store's id, display name and whether it has a Library section (Steam yes, Epic no). The store id type is derived from that list, not kept as a second hand-written union, so a new integration is added in one place.
- Every supported store is always listed, even before it is set up. Its view explains what to do.
- Entries are text only, with no store logos (brand rule: store logos appear only as small badges on games). The active entry is marked with the accent color and `aria-current="page"`. Entries are real buttons and work from the keyboard.

### Narrow windows
- 768 px or wider: the sidebar is always visible, at a fixed width (about 200–220 px).
- Narrower: the sidebar is hidden. A slim top bar shows the app name and a ☰ button that slides the sidebar over the content. Picking an entry, pressing Esc or clicking outside closes it, and focus returns to the ☰ button.

## Game views (All games, and one per store)
Every game view has the same two sections, limited to that view's store(s):
1. **Installed:** installed games, played by clicking the card.
2. **Library:** owned games that are **not** installed, installed by clicking the card.

- A game appears in exactly one section. A Steam game counts as installed when its `appId` is in the installed-games list.
- **Epic view:** shows the Installed section only. Epic has no owned-not-installed games (spec), so there is no empty Library heading.
- **All games:** Installed holds Steam and Epic installed games mixed. Library holds Steam's not-installed games.

## App-wide state
Switching views (or opening Settings) never resets or pauses anything. These belong to the whole app, not to a view:
- The Steam installed list, the owned library with its cache, retry timer, online listener and covers listener, and the Epic list with its cover status.
- The launch/install pause and the last launch/install message.

So owned-library retries keep running while the user fixes their key in Settings, and a launch started in one view still pauses the cards in every other view.

## Grid
- Uses the full width of the content area: no page max-width. Columns are added and removed as the window resizes (`auto-fill`, a minimum card width of about 160 px), with the same gap and padding at every size.
- Every card is a 2:3 poster with the title underneath. In **All games**, each cover also gets a small store badge ("Steam" / "Epic"); in a store view the badge is left off, since every game is from that store.
- Within each section, games are sorted by title (case-insensitive).
- A card is identified by `<store>:<id>` (Steam `appId`, Epic `AppName`), never by the bare id, because ids from different stores can collide.

## Card behavior
- **Installed card:** the whole card is the Play button (as Epic today). Steam opens `steam://rungameid/<appid>`, Epic keeps its current launch.
- **Library card (not installed):** the whole card starts an install. It opens `steam://install/<appid>`, and Steam shows its own install dialog. The aria-label reads "Install <title>".
- **Pause:** once a launch or install is accepted, there is one app-wide 5-second pause. Every card in every section and view pauses, and the clicked one shows "Starting…" (or "Opening Steam…" for an install). It survives a view switch.
- **Result as data:** Steam launch and install report "accepted" or a typed failure, like Epic's launch result does today, and never throw a message to the renderer. One message line shows at the top of the content area, in whatever view is open. A progress line ("Starting…") goes away when the pause ends. A problem line (for example "Could not open Steam. Make sure it's installed, then try again.") stays until the next launch or install, or until the window regains focus, since by then it may no longer be true (user's choice, 2026-10-03; Epic already worked this way).
- **Install request:** a new Steam-only IPC channel, zod-validated like launch (digits-only `appId`). Main builds the URL. The allow-list checks only the protocol, so `steam://` already passes; the safety comes from main building the URL from a validated id. Install is an optional part of the store contract: Epic has none.

## Covers
- Steam installed games use the owned library's cover for the same `appId` when there is one. Otherwise (no API key yet, or a game not in the owned list) the card shows the title on a placeholder.
- Epic covers are unchanged (SteamGridDB with the user's key, or the placeholder).

## Refresh
- Steam installed games are re-read on window focus, like Epic, so a game installed through Steam moves from Library to Installed when the user comes back to the app.
- **Failed read vs. no games:** today a failed Steam read and "no games" both come back as an empty list. Main must report a failed read separately: the Steam folder or registry entry can't be read, or any library folder can't be read (for example a sleeping or unplugged drive). On a failed read the renderer keeps the previous list, so games on that drive don't jump to Library and offer an install for a game that is already there.
- **Focus during a refresh:** if a card with keyboard focus moves to the other section or disappears, focus goes to that section's heading, not to the top of the page.
- The owned library, cache, offline pill, retry and "Try again" behavior are unchanged. The notice and "Try again" button sit at the top of the Library section, in All games and in the Steam view.

## Empty and missing states
- **Installed, loading:** skeleton posters.
- **Installed, empty:** in All games, "No installed games found on this PC". In a store view, "No Steam games installed on this PC" or "No Epic games installed on this PC".
- **Library, Steam not connected or no API key** (All games and Steam): "Connect Steam and add your Steam Web API key in Settings to see games you own but haven't installed", with a button that opens Settings.
- **Library, connected, every owned game installed:** "Every game you own is installed."
- **Library, empty or private profile:** the existing message.
- The Epic "add a SteamGridDB key for covers" hint lives in Settings. The game views don't nag about a missing key.
- A **problem** with a saved key is different. If Steam turns down the Steam key, the Library notice says "check it in Settings" (not "above") and has an "Open Settings" button. If SteamGridDB turns down the SteamGridDB key, one line with an "Open Settings" button shows in All games and the Epic view.

## Settings
The Steam sign-in, the Steam Web API key form and the SteamGridDB key form, moved without changes in behavior. They are grouped by store under headings ("Steam", "Epic"), so a future store adds its own group. The Epic group always shows its key form, even with no Epic games installed.

## Known limits (accepted)
- **Different accounts:** Installed comes from this PC's Steam folders, whoever is signed in to the Steam client. Library comes from the account connected in the app. If they are different accounts, the sections won't match. This is a personal app with one Steam account per Windows user.
- **Unreadable drive at startup:** the installed list is kept only in memory, so if a Steam library drive is asleep or unplugged when the app starts, its games show under Library (with Install) until a later read sees the drive, for example when the window regains focus (user's choice, 2026-10-03).
- **Installed but not owned:** family-shared and never-played free games are installed but not in the owned list, so they show with a title placeholder.
- **Non-games and partial downloads show as installed:** every Steam app manifest is listed, including tools such as "Steamworks Common Redistributables", dedicated servers and SDKs (user's choice, 2026-10-03), and a game whose download has only started. Clicking one hands it to Steam, which shows its own state.

## Not in this step
- Favorites, search, sort options, an Installed-only filter, or other Milestone 6 filters (the sidebar is where they can go later).
- Game counts in the sidebar, or remembering the last view.
- Fetching covers for Steam installed games that aren't in the owned list.
- Card size settings, list view, game detail page.
- Uninstalling, or knowing when a Steam install finishes (focus refresh only).
