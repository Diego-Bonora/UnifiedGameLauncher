# Unified Game Launcher — Project Plan

A Windows desktop app that connects to multiple game stores (Steam, Epic Games, GOG, Battle.net, Ubisoft Connect, EA app) and shows all games in a single library, where they can be launched and installed.

## 1. Project Scope

| Item | Decision |
|---|---|
| Platform | Windows only |
| Audience | Personal use + a few friends |
| Purpose | Learning project, published on my GitHub repository |
| Commercial use | None, the app will not be sold |
| Code | Written from scratch, no code copied from other projects |
| Development | Built with the help of Claude Code |

### What the app does

- Connects to game store accounts
- Shows all owned games in one library, with cover art
- Detects which games are installed
- Launches installed games
- Starts installations through the official launchers
- Works offline for installed games

### What the app does NOT do

- It does not replace the official launchers. Downloads and DRM are handled by each store's own client (Steam, Battle.net, etc.)
- It never sees or stores user passwords
- It does not send any data to a server of mine

---

## 2. Tech Stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript | JavaScript with types: fewer bugs, easier to read and learn from |
| Desktop framework | Electron | Lets me build a desktop app with web technologies |
| UI | React + Vite | Popular, well documented, fast development |
| Project setup | Electron Forge (Vite + TypeScript template) or electron-vite | Ready-made structure for Electron + TS + Vite |
| Packaging | electron-builder (NSIS installer) | Produces a normal Windows `.exe` installer |
| Settings / library cache | electron-store (JSON files) | Simple storage, no database to install |
| Secure token storage | Electron `safeStorage` | Encrypts tokens using Windows DPAPI |
| Auto-updates (optional) | electron-updater + GitHub Releases | Installed copies update themselves |

> A full database (like SQLite) is not needed at the start. JSON files are enough for a personal game library. SQLite can be added later if the library grows or needs complex searches.

### How an Electron app is structured

- **Main process**: runs Node.js. Reads files, checks the registry, stores tokens, launches games. This is where all the sensitive work happens.
- **Renderer process**: the UI (React). It has no direct access to the system.
- **Preload script**: a small bridge that exposes only specific, safe functions from the main process to the UI (via `contextBridge` and IPC).

---

## 3. Store Integrations

Each store is different. The general pattern is:

1. **Detect installed games** by reading local files or the Windows registry
2. **Get the owned library** through an API (official or unofficial), when possible
3. **Launch / install** through the store's URL protocol (e.g. `steam://`), which hands the job to the official launcher

### Overview

| Store | Owned library | Installed detection | Launch / install | Difficulty |
|---|---|---|---|---|
| Steam | Official Web API | Local Steam files | `steam://` protocol | Easy |
| Epic Games | Unofficial API (login required) | Launcher manifest files | `com.epicgames.launcher://` protocol | Medium |
| GOG | Community-documented API | Registry | `goggalaxy://` protocol or game exe | Medium |
| Ubisoft Connect | Not available (no public API) | Registry | `uplay://` protocol | Medium |
| Battle.net | Not available (no public API) | Registry (uninstall entries) | Battle.net launcher arguments / protocol | Hard |
| EA app | Not available (no public API) | Registry (uninstall entries) | EA app protocol | Hard |

> Paths, registry keys and protocols below are starting points for research. They can change when stores update their launchers, so always verify them on a real PC.

### Steam

- **Owned games**: Steam Web API, `IPlayerService/GetOwnedGames/v1` with `include_appinfo=1`
  - Needs a Steam Web API key and the user's Steam ID
  - The Steam ID can be obtained with "Sign in through Steam" (OpenID). This only proves who the user is. The ID is public and never expires
  - The user's game details must be public, or the user can use their own API key
- **Installed games**:
  - Steam install path: registry `HKCU\Software\Valve\Steam` → `SteamPath`
  - Library folders: `steamapps\libraryfolders.vdf`
  - Each installed game: `steamapps\appmanifest_<appid>.acf`
- **Launch**: `steam://rungameid/<appid>`
- **Install**: `steam://install/<appid>`
- **Cover art**: Steam's CDN provides images per app ID (header, capsule, library images)
- **API limits**: Steam's API terms allow around 100,000 calls per day per key

### Epic Games

- **Owned games**: no official API. Requires logging in through Epic's own login page and using undocumented endpoints. Needs research
- **Installed games**: manifest files in `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON)
- **Launch**: `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true`

### GOG

- **Owned games**: GOG's API is partly documented by the community. Login through GOG's login page
- **Installed games**: registry `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games`
- **Launch**: through GOG Galaxy's protocol or by running the game's exe directly (many GOG games are DRM-free)

### Ubisoft Connect

- **Installed games**: registry `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>` → `InstallDir`
- **Launch**: `uplay://launch/<id>/0`
- **Login**: not needed in my app. Ubisoft Connect handles it

### Battle.net

- **Installed games**: uninstall entries in `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall` (publisher: Blizzard)
- **Launch**: through the Battle.net launcher using each game's product code. Needs research
- **Login**: not needed in my app. Battle.net handles it

### EA app

- **Installed games**: uninstall entries in the registry (publisher: Electronic Arts)
- **Launch**: through the EA app. Needs research
- **Login**: not needed in my app. The EA app handles it

### Fallback: manual games

Let the user add any game manually by picking its `.exe`. This covers stores that aren't supported yet and non-store games.

---

## 4. Authentication and Tokens

### Rules

- **Never handle passwords.** Each store's own login page opens in a browser window. After the user signs in, the store gives the app a token
- The user can revoke access anytime from their store account settings
- Stores whose launcher handles everything (Battle.net, Ubisoft, EA) need no login in my app at all

### How tokens work

- **Access token**: sent with each request. Short-lived (often a few hours)
- **Refresh token**: longer-lived. Used only to quietly get a new access token when the old one expires

### How long users stay logged in

- Tokens are saved on disk (encrypted), so **restarting the PC does not log anyone out**
- Users only need to log in again if:
  - The refresh token expires (usually after the app hasn't been opened for a long time)
  - They change their password
  - They revoke access from their account
- Exact expiration times aren't always documented and can change

### Startup flow

1. Load saved tokens
2. Check if the access token has expired
3. If expired, use the refresh token to get a new one
4. If the refresh fails, show a friendly "Reconnect your [Store] account" button (never a raw error)

---

## 5. Security

Keeping data on the user's PC avoids having a central server full of accounts, but it still needs care.

### Token storage

- Store tokens encrypted with Electron's `safeStorage` (uses Windows DPAPI, tied to the Windows user account)
- Use plain JSON only for harmless data (game list, settings)
- Reason: there is malware that specifically searches PCs for Steam and Discord tokens

### API keys

- The Steam Web API key belongs to the developer. If it's bundled inside the app, anyone can extract it from the installed files
- Options:
  - Each user enters their own free Steam API key (simplest, recommended for personal use)
  - Read owned/installed games from local Steam files instead
  - A tiny server that holds the key and only forwards library requests (never login data)
- The same applies to other keys (e.g. SteamGridDB for cover art)

### Electron security settings

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Expose only specific functions through the preload script with `contextBridge`
- Validate all data received through IPC in the main process
- Don't load external websites inside the app with full permissions
- When launching games with `shell.openExternal`, **only allow known protocols** (`steam://`, `uplay://`, etc.). Never pass arbitrary URLs

### Dependencies and updates

- Use well-known, maintained npm packages only
- Keep dependencies updated (`npm audit`)
- Auto-updates must only come from my official GitHub Releases

---

## 6. Data Storage

Everything lives in the user's app data folder (`%APPDATA%\<AppName>`). The user never installs or sets up anything.

| Data | Storage | Encrypted |
|---|---|---|
| Store tokens | `safeStorage` | Yes |
| User API keys | `safeStorage` | Yes |
| Settings | electron-store (JSON) | No |
| Game library cache | JSON file | No |
| Cover images | Image cache folder | No |

---

## 7. Offline Mode

The app must keep working without internet.

- Load the library from the local cache on startup, before any network requests
- Show cached cover images
- Installed games can still be launched (as long as the official launcher itself allows offline play)
- Detect when the internet is back and refresh the library in the background
- Show a small "Offline — showing saved library" indicator instead of errors
- Never delete saved tokens just because a request failed due to no connection (only when the store explicitly rejects them)

---

## 8. Packaging and Distribution

- Build a Windows installer (`.exe`) with electron-builder
- Upload it to **GitHub Releases**
- Friends download it, install it, and use it like any other program
- **Code signing**: without a paid certificate, Windows shows "Windows protected your PC." Users can click **More info → Run anyway**. Fine for personal use and friends
- **Auto-updates** (optional): electron-updater checks GitHub Releases for new versions

---

## 9. Roadmap

| Milestone | Goal |
|---|---|
| 0. Setup | Electron + TypeScript + React project that builds into a working installer |
| 1. Steam installed games | Detect installed Steam games and launch them (no login needed) |
| 2. Steam library | Steam sign-in + user API key, full owned library, cover art |
| 3. Library cache + offline mode | Save library locally, load instantly, work without internet |
| 4. Epic Games | Detect and launch installed games, then add login + owned library |
| 5. Other launchers | GOG, Ubisoft, Battle.net, EA: detect and launch installed games |
| 6. Features | Manual games, search, filters, favorites, sort by store |
| 7. Release | Polish, privacy policy in the app, GitHub release, optional auto-updates |

> Each store should work end to end before starting the next one.

---

## 10. Working with Claude Code

Since this is a learning project:

- Keep this file in the repository so Claude Code has the full plan as context
- Work one milestone at a time, in small steps
- Ask Claude Code to explain what it wrote and why
- Read and review every change before committing
- Commit after each working step, with clear commit messages
- Build everything from scratch: existing launchers and community documentation can be read to understand how stores work, but no code is copied

---

## 11. Legal and Terms of Service

- **Trademarks**: "Steam," "Epic Games," etc. are trademarks. Store logos can be used to show a game's source, but the app must not look official or endorsed, and must not use store names in its own name
- **Terms of service**: Steam's Web API has its own terms of use. Unofficial access to other stores (e.g. Epic) is a gray area. For a personal, non-commercial app shared with a few friends, the risk is low
- **No piracy or DRM bypass**: the app only launches games through official launchers and only shows games the user owns

---

## 12. Privacy Policy (Draft)

> This draft is written in plain language. Replace `[App Name]` and `[GitHub link]` before publishing.

### Privacy Policy for [App Name]

**Last updated:** [date]

[App Name] is a personal, open-source project. It is not a commercial product and is not affiliated with Valve, Epic Games, GOG, Ubisoft, Blizzard, Electronic Arts, or any other game store.

**What data the app uses**

- Login tokens for the game stores you choose to connect
- API keys you enter (such as a Steam Web API key)
- Your Steam ID and similar public account identifiers
- Your game library: game names, IDs, cover images, install locations
- App settings

**Where your data is stored**

All data is stored only on your computer, in the app's data folder (`%APPDATA%\[App Name]`). Login tokens and API keys are encrypted using Windows' built-in protection.

**What the app never does**

- It never asks for or stores your passwords. You log in on each store's own website
- It never sends your data to the developer or any server owned by the developer
- It contains no analytics, tracking, or ads

**Who the app communicates with**

The app connects directly from your computer to:

- The game stores you connect (to get your library)
- Image services (to download cover art)
- GitHub (to check for updates, if enabled)

These services have their own privacy policies.

**How to delete your data**

- Disconnect a store from the app's settings to delete its saved tokens
- Revoke the app's access from your account settings on each store's website
- Uninstall the app and delete the `%APPDATA%\[App Name]` folder to remove everything

**Contact**

For questions, open an issue at [GitHub link].
