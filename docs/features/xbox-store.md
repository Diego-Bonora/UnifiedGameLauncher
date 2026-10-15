# Xbox Store (v2, draft)

Decided 2026-10-15. **Planned for v2** (Milestone 5, with the other launchers); nothing here is built in v1. Builds on @docs/features/library-layout.md like Steam and Epic.

**Status: draft.** A staff-engineer review (2026-10-15) found gaps; the rules it settled are in "Settled after review" below and override anything above them. Everything under "Open before building" must be resolved (each with its one check on a real PC) and this spec re-reviewed before any code is written.

**Problem it solves:** games installed by the Xbox app (Game Pass and Microsoft Store PC games) don't show up, and they can't be added as manual games either: Windows refuses to hand any other program an `.exe` from an Xbox game's `Content` folder (found 2026-10-15 with Minecraft Launcher in `C:\XboxGames\Minecraft Launcher\Content`), and such games must be started through Windows' app system, not by their `.exe`.

User's calls (2026-10-15):
- **v2**, not v1.
- **Xbox app installs only:** the games the Xbox app installed, found through its `.GamingRoot` files. Not every Microsoft Store app that looks like a game (that also catches apps that aren't games and is hard to filter).
- **Covers:** the store's tall poster, saved locally like Steam's and Epic's; otherwise the title on a placeholder.
- **Same game in two stores:** two cards, each with its store badge (like Steam and Epic today). No merging.

## Store entry
- **Xbox** is another entry in the shared store list (`shared/stores.ts`), with `hasLibrary: false`: a sidebar entry, a view with an Installed section only, its badge ("Xbox") in All games. Owned-but-not-installed games would need a Microsoft account login, which is out of scope (like Epic).
- Main-process code in `main/stores/xbox/`, implementing the shared store provider interface.
- No connect step, no key, no login.

## Detection
For each drive (`A:`–`Z:` that exists):
1. Read `<drive>:\.GamingRoot` if present (the Xbox app writes one per drive it installs to). Format, from a real file (28 bytes on the user's `C:`): the 4 bytes `RGBX`, a 32-bit little-endian count, then that many folder names relative to the drive root, each UTF-16LE and ending in a zero character. Example: `52 47 42 58 01 00 00 00` + `XboxGames\0` in UTF-16LE.
2. Each subfolder of a listed folder is a candidate game, e.g. `C:\XboxGames\Minecraft Launcher`. A candidate counts only if `<candidate>\Content\MicrosoftGame.config` exists and parses. Other folders are skipped quietly (the real `C:\XboxGames` also holds `GameSave`, the Xbox app's own save folder).
3. From `MicrosoftGame.config` (XML; readable even though the folder's `.exe` files are not): `Identity/@Name` (package name, e.g. `Microsoft.4297127D64EC6`), `ShellVisuals/@DefaultDisplayName` (title, e.g. "Minecraft Launcher"), `StoreId` (e.g. `9PGW18NPBZV5`). The file name's case varies (`MicrosoftGame.Config` in the real folder listing): match it case-insensitively.
4. The **app ID** Windows starts it by, e.g. `Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft`: the package family name (package name + `_` + publisher code) plus `!` plus the application id from `Content\appxmanifest.xml`. How main gets the publisher code (Windows' package records, or a PowerShell `Get-StartApps` call) is decided in the build step's plan, from a real sample.
5. A game whose config can't be read or has no title is skipped with a log line, never shown with a raw name. An unreadable drive or `.GamingRoot` is a failed read, not "no games" (same rule as Steam's unreadable libraries: games already shown stay).

Real samples: @docs/sources/xbox-samples/ (`MicrosoftGame.config` of Minecraft Launcher, the `.GamingRoot` bytes, the catalog's image list).

## Launching
- `explorer.exe "shell:AppsFolder\<app id>"`, the way the Start menu starts it. Verified 2026-10-15 on the user's PC: `explorer.exe "shell:AppsFolder\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft"` opened Minecraft Launcher.
- **Security:** a third kind of launch next to the allow-listed `steam://` / `com.epicgames.launcher://` links and the user-picked manual `.exe`. Main runs `explorer.exe` itself with exactly one argument, `shell:AppsFolder\<app id>`, and only for an app id it detected from a `.GamingRoot` folder right now; the renderer sends only the detected game's id, never an app id or a path. App ids are validated by shape (package family name, `!`, application id; letters, digits, `.`, `_`, `-` only). `shell.openExternal` stays limited to the two protocols. @docs/features/auth-roles.md gets this rule when it is built.
- Results come back as data, like the other stores: `accepted`, `notInstalled` (gone since detection), `failed`. The app-wide 5 s pause and message line apply.

## Covers
- From Microsoft's public store catalog by `StoreId`, no login or key: `GET https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=<StoreId>&market=US&languages=en-US`. Verified 2026-10-15 from the user's PC: it answered with the title and an image list including **`Poster` 1440×2160 (2:3)**, plus `BoxArt` 2160×2160, `Logo`, hero art and screenshots.
- Use the image with `ImagePurpose` `Poster`. Its `Uri` has no scheme (`//store-images.s-microsoft.com/image/...`): add `https:`. Only `store-images.s-microsoft.com` is accepted.
- No poster: the title on a placeholder (no square BoxArt, which would crop badly; no in-folder `StoreLogo.png`, which is small and square).
- Saved in `covers-xbox/`, served through `app-cover://xbox/<id>`, checked by bytes and size-capped while streaming, like the other caches; a miss is remembered and asked again after 7 days, like Epic's.
- Privacy policy gains a line: the store ids of installed Xbox games are sent to Microsoft's store catalog to fetch covers.

## Manual games
Until v2, Xbox games can't be added as manual games (Windows blocks the file picker). The spec for manual games says so as a known limit; no special message in v1.

## Settled after review (2026-10-15)
- **Card id = the package name** from `Identity/@Name` (e.g. `Microsoft.4297127D64EC6`). It is the `xbox:<id>` favorites key, the `covers-xbox/` file name and the `app-cover://xbox/<id>` path, so it never changes after v2 ships. The `StoreId` is only the cover lookup key, stored separately with each cover ("fetched for StoreId X"), so a changed or missing StoreId never shows a wrong leftover cover. A game without a `StoreId` is shown with its title on a placeholder and never asks the catalog.
- **Launch is tied to the folder:** a game is launched only if Windows' own record of the registered package (for the current user) says it is installed in the folder it was detected in. A config file alone never decides what runs, so files dropped on a drive root can't make a card start another app.
- **`explorer.exe` by full path** (`%SystemRoot%\explorer.exe`, resolved by main), never by bare name, with exactly one argument.
- **App id shape:** exactly one `!`; package name, `_`, a 13-character publisher code, `!`, application id; letters, digits, `.`, `_`, `-` only; no leading `.` or `..`; length-capped. Checked in main right before launching.
- **`shell:` never goes on the link allow-list** (`isAllowedExternalUrl`), which the window-open handler shares. `shell.openExternal` stays limited to `steam://` and `com.epicgames.launcher://`.
- **The launch channel requires the app-sender check** (`isAppSender`), like manual launch, and the renderer gets no folder path.
- **Failures are per drive:** a drive that can't be read keeps only that drive's games as they were; other drives update normally. A drive that is not ready (empty card reader, locked, disconnected) is "unknown" for its games, never "no games" for all (lessons.md 2026-10-15).
- **Titles:** a `DefaultDisplayName` that is an `ms-resource:` reference is not shown raw (the game is skipped until a readable title rule exists).
- **The same id found twice** (a leftover folder after a move): one card, from the folder Windows' package record points to.
- **Launch result:** `accepted` means main started `explorer.exe`; whether the game itself started can't be seen (explorer hands it to Windows and exits).

## Open before building
Each needs one check on a real PC (see @docs/sources/xbox-samples/README.md for what is already verified):
1. **Publisher code / package record:** how main finds the package family name and install folder without a hidden PowerShell process (antivirus risk, slow, blocked on managed PCs). Check `Get-AppxPackage -Name Microsoft.4297127D64EC6 | fl Name,PackageFamilyName,InstallLocation` and whether the same is readable from the registry.
2. **Application id:** capture `Content\appxmanifest.xml` and confirm `Application/@Id` = `Minecraft`; rule for games with several executables (`Select-String "<Executable " C:\XboxGames\*\Content\MicrosoftGame.config`).
3. **Provider shape:** a third launch kind next to URL and direct, or `direct` reused; partial per-drive results; failure values. Inherited by the other v2 launchers.
4. **`.GamingRoot` with several folders, and on a second drive.** Malformed files (count vs length, no terminator, empty or `..` names) are a failed read for that drive.
5. **A listed folder that doesn't exist** (an install location removed in the Xbox app): no games there, or unknown.
6. **Games mid-install or mid-update:** whether the config stays readable during an update; a game not yet registered is not shown.
7. **Add-ons / DLC folders** under `XboxGames`: install a free add-on and compare the folder list.
8. **Other titles:** all five installed games' configs (path, plain-text title, `StoreId`).
9. **Bad app id:** what `explorer.exe` does with an unregistered app id, and its exit code on success.
10. **Covers:**
    - The poster's byte size and format.
    - Posters and image host for all five games.
    - The answer for an unknown `StoreId`.
    - The same request from Node `fetch` (the app's client, not PowerShell).
    - Market other than US.
    - Cover rules to define: pruning / last seen, backoff, response size cap.
11. **Detection cost:** when to rescan (focus, like Epic?), and how to avoid stalls on network drive letters.
12. **When built, update:**
    - `spec.md` Data Model and Key Flows #3 (no longer "the one exception");
    - `CLAUDE.md`'s launch rule;
    - `auth-roles.md`;
    - the renderer checks the compiler won't flag (`installedLoading`, cover retry token, empty-state text);
    - favorites' id schema.
13. **Known limits to state:**
    - older UWP/MSIX Game Pass titles in `WindowsApps` (no `MicrosoftGame.config`);
    - volumes mounted without a drive letter;
    - games installed by another Windows user.

## Not in this feature
- Owned-but-not-installed Xbox games, Game Pass catalog, achievements (need a Microsoft login).
- Microsoft Store apps not installed by the Xbox app, and other UWP/MSIX apps.
- Installing Xbox games from the app (the Xbox app does that).
- Merging the same game across stores.
