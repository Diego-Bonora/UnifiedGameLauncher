# Library Tools (Milestone 6)

Decided 2026-10-03. Milestone 6 adds search, favorites and manual games. Builds on @docs/features/library-layout.md; everything there stays unless this file says otherwise.

User's calls (2026-10-03):
- **Sort by store** needs no sort control: the sidebar already shows one view per store. It means adding one more "store", **Manual**, for games the user adds by hand.
- **Filters** means a search box in every game view that filters by name. No other filters (no Installed-only toggle, no hidden games, no Favorites view).
- **Favorites** are a star that pins a game to the top of its section.
- Build order, one step each, smallest first: 1) search, 2) favorites, 3) manual games (store entry, add/edit/remove, launch), 4) manual game covers.

## 1. Search

- A search box at the top of every game view (All games, Steam, Epic, Manual). Not on Settings.
- **One query for the whole app:** switching from All games to Steam keeps it, like the other app-wide state. It is not saved; the app starts with an empty box.
- **Matching:** the query matches anywhere in the title, ignoring case, accents ("pokemon" finds "Pokémon") and the ®/™ symbols Epic titles carry. Leading and trailing spaces are ignored; an empty query shows everything.
- **Both sections** are filtered: Installed and Library. Section headings stay, so the user can see where a match is.
- **No matches in a section:** "No installed games match “<query>”." / "No games in your library match “<query>”." The section's loading skeletons, setup prompts ("Connect Steam…") and key notices are unchanged: those explain why the list is empty, which a search can't fix.
- **Keys:** Ctrl+F focuses the box from anywhere in a game view. Esc in the box clears it (Esc still closes the narrow-window drawer first if it's open). An × button clears it too and returns focus to the box.
- **Accessibility:** the box has a visible label or `aria-label` "Search games", and a polite live region announces the number of matches after typing stops.
- **Focus:** typing never moves focus out of the box, even when the focused-card rule from the layout spec would otherwise apply (the box, not a card, has focus).
- **Pure logic:** the matching function lives in a tested helper next to `game-cards.ts`, and runs after sections are built, so sorting and section rules don't change.

## 2. Favorites

- A **star** button on every card (all stores, both sections). Starred games sort first in their section, then by title as today. In All games a starred game is first among all stores' games.
- The star is its own button beside the card's main button, never nested inside it (a button inside a button is invalid HTML and breaks keyboard use). It is visible on starred cards, and on hover/focus for the others. Label: "Add <title> to favorites" / "Remove <title> from favorites", with `aria-pressed`.
- Starring doesn't launch or install, and works while the app-wide launch pause is on.
- **Saved in main**, in `favorites.json` in the app data folder (plain JSON, temp-file-then-rename like `connections.json`). It holds the set of card keys (`<store>:<id>`). A game moving between Installed and Library keeps its star. An uninstalled or no-longer-owned game's key is kept (it costs nothing and the star comes back if the game does). Removing a manual game removes its key.
- **IPC:** one channel to read the set, one to set a key on or off. The key is validated in main with zod (known store id, id of the right shape for that store, length cap). An unreadable or invalid `favorites.json` reads as "no favorites" and is not overwritten until the user stars something; the read failure is logged, not shown.
- **Optimistic UI:** the star flips at once; if saving fails, it flips back and the message line says "Couldn't save your favorite. Try again."

## 3. Manual games

### Store entry
- **Manual** is a third entry in the shared store list (`shared/stores.ts`), after Steam and Epic, with `hasLibrary: false`. So it gets a sidebar entry, a view with an Installed section only, its card badge ("Manual") in All games, and its games mixed into All games. Every manual game counts as installed.
- Its main-process code lives in `main/stores/manual/`. It does not launch through a URL, so the `StoreProvider` contract changes to let a store launch itself; the exact shape is decided in that step's plan.

### Adding a game
- An **Add game** button in the Manual view's header, and in its empty state ("No manual games yet. Add any game by picking its .exe.").
- Main opens the native file dialog itself, limited to `.exe` files. The renderer never sends a path to main, for any manual-game action.
- After picking, a small form: **Title** (pre-filled from the file name without `.exe`) and **Launch arguments** (empty). Save adds the game; Cancel adds nothing.
- Picking an `.exe` that's already a manual game: "That game is already in your library" and nothing is added.

### Editing
A **⋯** button on each manual card (its own button beside the card, like the star) opens a small menu:
- **Rename**: same title rules as adding.
- **Launch arguments**: edit the arguments.
- **Change .exe**: main opens the file dialog again and replaces the path (for a moved or reinstalled game). Title, arguments, star and cover stay.
- **Remove**: asks "Remove <title> from your library? Its files on your PC are not touched." Removing deletes the entry, its star and its saved cover/icon; never any game files.

Titles: 1–200 characters after trimming. Arguments: up to 1,000 characters. Both validated in main.

### Launching
- Clicking the card plays it. The renderer sends only the manual game's id; main looks up the saved path and arguments.
- Main starts the saved `.exe` directly: no shell, working folder = the exe's folder, detached so closing the app doesn't close the game. Arguments are split on spaces, with double quotes grouping (`-config "C:\My Games\a.ini"` is two arguments).
- Before starting, main checks the path still exists, still ends in `.exe`, and is a file. If not, the result is "missing", and the message line says "Couldn't find <title>'s .exe. Use Change .exe to find it again." (no raw error).
- Start failures (Windows refuses to run it, for example blocked by antivirus) report "couldn't start" as data: "Couldn't start <title>. Check that the game still runs from its folder."
- The app-wide 5 s pause and message line work as for Steam and Epic.
- **Security:** this is a narrow exception to "openExternal only for `steam://` and `com.epicgames.launcher://`", which stays as it is. Only paths the user picked in the native dialog, saved by main, are ever run; the renderer can't name a path or a program. `.bat`/`.cmd`/`.lnk` are not accepted.

### Saved data
`manual-games.json` in the app data folder (plain JSON, temp-file-then-rename). Per game: `{ id, title, exePath, args, cover? }`, where `id` is a random UUID made by main. An unreadable file reads as "no manual games" and is not overwritten until the user adds or edits one, so a bad read can't wipe the list (lessons.md: never overwrite good data with an empty result). Manual games work fully offline.

## 4. Manual game covers

- **First choice: a Steam poster.** When a game is added, or renamed, main searches Steam's store by the title. It uses the cover only when a result's name matches the title exactly, ignoring case, accents, ®/™ and punctuation. Otherwise there's no cover. The poster is fetched from the same Steam cover service the Steam library uses, saved in `covers-manual/`, and checked by its bytes like the other caches.
- **Otherwise: the exe's icon on the placeholder.** Main reads the `.exe`'s icon from Windows (`app.getFileIcon`) and saves it as a PNG beside the covers. The card shows the title placeholder with that icon in the middle. An exe without its own icon gets Windows' generic one, which is fine.
- A failed lookup (offline, Steam erroring) is retried on a later app start, no more than once per game per session. A miss (no exact match) is remembered for that title and not asked again unless the game is renamed.
- **Wrong matches** are possible with an exact title (two games with the same name). Accepted for v1; Rename to something else drops the Steam cover.
- **UNVERIFIED (check before Step 4):** that Steam's store search by title answers a plain keyless request, and what it returns. This cloud session's network policy blocks the Steam store, so the user makes one plain request from their own PC first (lessons.md, 2026-09-21). If it doesn't work, Step 4 is exe icon only.
- The privacy policy gains a line: the titles of manual games are sent to Steam to find a cover.

## Not in this milestone
- Sort options, a Favorites view, Installed-only toggle, hidden games, Steam tool filtering.
- Search in Settings, saved searches, searching by store or tag.
- Manual covers from a user-picked image, SteamGridDB covers for manual games.
- Play time or "recently played" for any store.
- Importing games from other launchers (that's Milestone 5, v2).
