# Epic covers (SteamGridDB)

Replaces the planned Epic stage 2 (Epic login + owned library). Decided 2026-10-02.

## Why no Epic login
- Epic's official login (Epic Account Services) can't list a library.
- The only login that can list one means acting as Epic's own launcher (its public launcher client id) and calling its private library service.
- Epic Games Store EULA (2025-01-15) §2: no use "not expressly authorized" and no reverse engineering of the Software, which includes the launcher's "methods of operation". Epic ToS (2026-09-10): use only "as expressly stated", no bot software to automate use. The penalty is the user's Epic account, which holds the games they bought.

## What it does
- Installed Epic games (from launcher manifests) get a 2:3 poster from SteamGridDB, looked up by the game's Epic id.
- Each user enters their own free SteamGridDB API key in the Epic section. It's optional: with no key, tiles keep the title-on-placeholder look.
- Covers are downloaded by `main` into `covers-epic/` and shown only as `app-cover://epic/<AppName>`. The renderer never loads SteamGridDB URLs directly. Steam's `app-cover://covers/<digits>` stays unchanged.
- No title search.

## Ids
- **Storage id = `AppName`.** Every detected game has one, already validated (`[A-Za-z0-9_-]`) and already used for launch. Cover files, "no cover" records and cover URLs use it.
- **Lookup id = `AppName` too** (confirmed 2026-10-02: `/grids/egs/Sugar` → Rocket League; `CatalogItemId` and namespace → 404). The lookup id stays a separate field in code, so changing it later never moves files on disk.
- **Coverage gap (known):** SteamGridDB only finds games it has linked to Epic. Bloons TD 6 is in SteamGridDB but linked to Steam only, so it stays on the placeholder (title search was declined).

## When lookups happen
- At startup, when the set of installed games changes, and right after a key is saved. Not on every window focus: a focus only syncs again if the last sync failed (offline, SteamGridDB trouble, an unreadable state file) or the key couldn't be read. These retries wait for the 15-minute backoff, which a covers folder or state file that can't be used also starts; until it ends, a focus does nothing. Decided 2026-10-02: otherwise being offline for a few seconds at startup meant no covers for the whole session.
- **No match:** only SteamGridDB's own answer counts: `404 "Game not found"` or an empty list. The game keeps its placeholder and isn't asked about again for 7 days.
- **Unusable posters:** posters came back but none passed our checks. That game is skipped this sync and logged: no "no cover" mark, no backoff, other games are still looked up, and it is asked about again at the next sync (at the latest the next app start).
- **Offline, 5xx, 429, or a block page:** nothing is recorded as "no cover". No new attempt for 15 minutes (longer if SteamGridDB sends `Retry-After`, capped at 24 hours). Saved covers keep showing. No raw errors.
- **Key rejected (401/403 with SteamGridDB's own `{ success: false, errors }` body; a Cloudflare or proxy 403 counts as unavailable):** keep the key and show "SteamGridDB didn't accept your key. Check it or remove it". No more requests until the key changes. Never delete it automatically.
- **Saving or removing a key:** stops any lookup in progress (an answer for an old key never sets the status of a new one) and clears the "no cover" records (if that write fails, the next sync clears them).
- **Removing the key:** stops lookups. Saved covers stay, because they're plain images with nothing personal in them. The folder housekeeping (last-seen dates, pruning, leftover files) still runs without a key when the installed games change; it needs no network.

## Keeping the folder tidy
- Each game's "last seen installed" date is recorded. A cover is deleted only once its game hasn't been detected for 30 days, and the record goes only after the file is really gone (a failed delete is retried next sync, not given another 30 days). A locked manifest or a game mid-update drops out of the list for a moment, and that must not delete its cover.
- An empty or failed detection (including a missing manifests folder because the Epic launcher was uninstalled) never deletes anything.
- A state file that can't be read (anything but "doesn't exist", e.g. locked by antivirus) stops the sync: nothing is deleted or looked up, and with a key saved the Epic section shows "unavailable". A corrupt or old-version file starts fresh, and any cover on disk without a record gets a new 30 days instead of being deleted.

## Downloads
- API answers are capped at 1 MB. Ids that are Windows device names (`CON`, `NUL`, `COM1`…) are refused, since the id becomes a file name.
- Same safety rules as Steam covers: an exact-host allow-list (the host is confirmed by a real request), no redirects, a 5 MB cap enforced while streaming, the type checked by magic bytes, and temp-file-then-rename.
- Image host: `cdn2.steamgriddb.com` only (seen for both `url` and `thumb`). Use the full `url` (600x900 PNG ≈ 0.8 MB, under the 5 MB cap); the `thumb` (267x400 JPEG) is too small for HiDPI tiles.
- Request posters only (`600x900`, `342x482`, `660x930`), static, PNG or JPEG, with SteamGridDB's nsfw/humor/epilepsy filters on their safe defaults. Animated files (APNG, animated WebP) are rejected by their bytes, so this doesn't depend on SteamGridDB's filter.

## IPC and the window
- The window learns only `hasKey` and a `problem` (`keyRejected` / `unavailable` / none). It never sees the key.
- Saving a key returns that status as data and never throws (Steam's `setApiKey` still throws; don't copy it). Key check: trimmed, exactly 32 hex characters (the real key's format).
- `EpicInstalledGame` gains `coverUrl: string | null`. A tile only ever upgrades from placeholder to cover, never back.

## Real API answers (captured 2026-10-02, redacted)
- One id: `200 { success, page, total, limit, data: [grid…] }`. A grid has `id, width, height, mime, url, thumb, style, nsfw, humor, epilepsy, …`. The `dimensions` filter is honoured (without it, 920x430 and 1024x1024 come back too).
- Several ids (`/grids/egs/a,b,c`): `207`, `data` is one entry per requested id **in request order**, with **no id echoed back**: `{ success: true, status: 200, data: [one top grid] }` or `{ success: false, status: 404, errors: ["Game not found"] }`. Not seen: what comes back when every id misses.
- Unknown game (one id): `404 { success: false, status: 404, errors: ["Game not found"] }`. This counts as "no cover".
- Wrong key: `401 { success: false, errors: ["Invalid API key"] }` for the whole request. No rate-limit headers were seen.

## Data sent to SteamGridDB
The user's key, plus the lookup ids of installed games. Nothing else.

## Out of scope
Epic login and owned library; SteamGridDB for Steam games; title search; letting the user pick an alternative cover; a "clear Epic covers" button.
