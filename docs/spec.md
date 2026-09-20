# Product Spec

Full background lives in @docs/sources/PROJECT_PLAN.md (store research, security, privacy draft).

## Vision
UnifiedGameLauncher is a Windows desktop app that shows every game you own on Steam and Epic Games (more stores in v2) in one cover-art-first library. It detects which games are installed, launches them, and starts installs through the official launchers, and it keeps working offline. It is a personal, open-source learning project for the author and a few friends: not commercial, never handles passwords, and sends no data to any server of mine.

## Users & Roles
One local user per Windows account. There are no roles or permissions tiers. Store connections are described in @docs/features/auth-roles.md.

## Core Features (v1)
- Unified library with cover art across Steam and Epic
- Installed-game detection (Steam local files, Epic launcher manifests)
- Launch and install through official launchers via allow-listed URL protocols
- Steam sign-in (OpenID) plus user-supplied Steam Web API key for the owned library
- Epic in two stages: (1) installed detection + launch, no login; (2) login + owned library, built separately and allowed to fail (degrades to installed-only with a friendly notice)
- Library cache and offline mode
- Manual games (pick an .exe)
- Search, filters, favorites, sort by store
- In-app privacy policy
- Windows installer distributed through GitHub Releases
- Auto-updates via electron-updater + GitHub Releases (Milestone 7; works with an unsigned installer)

## Out of Scope (v1)
- GOG, Ubisoft Connect, Battle.net, EA app (planned for v2)
- Code signing (installer is unsigned; SmartScreen warning accepted)
- macOS and Linux
- SQLite or any database; any backend or server
- Replacing official launchers, downloads, or DRM handling
- Controller / Big Picture mode
- Light theme

## Data Model
- `Game { id, store, storeGameId, title, coverPath, installed, installPath?, favorite, lastPlayed? }`
- `StoreConnection { store, status, tokens (encrypted) }`
- `Settings`

Stored as JSON in `%APPDATA%\<APP_NAME>`. Tokens and API keys go only through Electron `safeStorage`.

## Key Flows
1. **Startup:** load cached library, render immediately, refresh in the background, show an offline pill if there is no network.
2. **Connect a store:** open the store's own login page, receive a token, save it encrypted, sync the library.
3. **Play / Install:** click, then the app opens an allow-listed protocol URL (`steam://`, `com.epicgames.launcher://`), and the official launcher does the work.
