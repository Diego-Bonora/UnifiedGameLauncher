# Product Spec

Full background lives in @docs/sources/PROJECT_PLAN.md (store research, security, privacy draft).

## Vision
UnifiedGameLauncher is a Windows desktop app that shows every game you own on Steam, plus your installed Epic Games titles (more stores in v2), in one cover-art-first library. It detects which games are installed, launches them, and starts installs through the official launchers, and it keeps working offline. It is a personal, open-source learning project for the author and a few friends: not commercial, never handles passwords, and sends no data to any server of mine.

## Users & Roles
One local user per Windows account. There are no roles or permissions tiers. Store connections are described in @docs/features/auth-roles.md.

## Core Features (v1)
- Unified library with cover art across Steam and Epic: a sidebar with All games and one view per store, each split into an Installed section and a Library section (not installed) in a full-width poster grid, with store settings on their own screen. See @docs/features/library-layout.md
- Installed-game detection (Steam local files, Epic launcher manifests)
- Launch and install through official launchers via allow-listed URL protocols
- Steam sign-in (OpenID) plus user-supplied Steam Web API key for the owned library
- Epic: installed detection + launch, no Epic login. Owned-but-not-installed Epic games are not shown. Decided 2026-10-02 after reading Epic's EULA/ToS: an Epic login would mean acting as Epic's own launcher. See @docs/features/epic-covers.md
- Epic cover art from SteamGridDB, using a SteamGridDB API key the user enters (optional; without it, tiles show the title on a placeholder)
- Library cache and offline mode
- Manual games (pick an .exe)
- Search, filters, favorites, sort by store
- In-app privacy policy
- Windows installer distributed through GitHub Releases
- Auto-updates via electron-updater + GitHub Releases (Milestone 7; works with an unsigned installer)

## Out of Scope (v1)
- GOG, Ubisoft Connect, Battle.net, EA app (planned for v2)
- Epic login and Epic owned library (Epic's terms; revisit only if Epic offers an official library API)
- SteamGridDB covers for Steam games (Steam's own CDN covers them) and SteamGridDB search by title
- Code signing (installer is unsigned; SmartScreen warning accepted)
- macOS and Linux
- SQLite or any database; any backend or server
- Replacing official launchers, downloads, or DRM handling
- Controller / Big Picture mode
- Light theme

## Data Model
- `Game { id, store, storeGameId, title, coverPath, installed, installPath?, favorite, lastPlayed? }`
- `StoreConnection { store, status }` (Steam: public Steam ID; no store tokens are stored today)
- `Settings`
- Epic cover state per `AppName`: `{ lastSeenInstalled, noCoverCheckedAt? }` (prunes covers after 30 days unseen; re-asks SteamGridDB about misses after 7 days). See @docs/features/epic-covers.md

Stored as JSON in `%APPDATA%\<APP_NAME>`. Tokens and API keys (Steam Web API key, SteamGridDB key) go only through Electron `safeStorage`. Cover images live in per-store folders (`covers/` for Steam, `covers-epic/` for Epic).

## Key Flows
1. **Startup:** load cached library, render immediately, refresh in the background, show an offline pill if there is no network.
2. **Connect Steam:** open Steam's own login page in the system browser, receive the public Steam ID, the user adds their Steam Web API key (saved encrypted), sync the library. Epic has no connect step; adding a SteamGridDB key only adds covers.
3. **Play / Install:** click, then the app opens an allow-listed protocol URL (`steam://`, `com.epicgames.launcher://`), and the official launcher does the work.
