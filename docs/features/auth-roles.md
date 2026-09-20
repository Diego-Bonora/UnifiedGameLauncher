# Auth & Roles

This app has no user accounts or roles of its own. This file covers how it connects to store accounts.

## Authentication Method
- Each store's own login page (OpenID for Steam, OAuth-style login for Epic), never a password form inside the app.
- The app receives a token (or, for Steam, only the public Steam ID) after the user signs in.
- Steam owned library also needs a Steam Web API key that the user enters themselves.

## Roles
None. One local user per Windows account.

## Permission Rules
- Tokens and API keys are stored only via Electron `safeStorage` (Windows DPAPI). Plain JSON is for harmless data only.
- Delete saved tokens only when the store explicitly rejects them. Never because a request failed offline.
- `shell.openExternal` accepts only allow-listed protocols: `steam://`, `com.epicgames.launcher://`. Never arbitrary URLs.
- All IPC payloads are validated in the main process.

## Auth Flow
1. Load saved tokens.
2. If the access token is expired, use the refresh token.
3. If refresh fails, show a friendly "Reconnect your [Store] account" button (never a raw error).

## Security Notes
- Electron settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; expose only specific functions through the preload script.
- Do not bundle the developer's Steam API key; each user supplies their own.
- Do not load external sites in the app window with full permissions.
- Epic owned-library uses undocumented endpoints and can break; it must fail gracefully to installed-only.
