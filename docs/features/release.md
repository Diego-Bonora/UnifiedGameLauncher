# Release (Milestone 7)

Decided 2026-10-17. Milestone 7 makes v1 shippable: an About section with the privacy policy, auto-updates, a release flow on GitHub, an app icon, and a few known bugs fixed. Nothing here changes the library itself.

User's calls (2026-10-17):

- **Name:** v1 ships as **UnifiedGameLauncher** (the working title). Nothing is renamed, so the AppData folder stays the same.
- **License:** MIT.
- **Updates:** the app checks, then **asks before downloading**. There is a switch in Settings, **on by default**, plus a "Check now" button. A `settings.json` that exists but can't be read counts as **off** (after the spec review).
- **About and privacy** go in an **About group at the bottom of Settings**, not in a new sidebar entry.
- **Release flow:** pushing a `v*` tag makes CI build the installer and upload it to a **draft** GitHub Release. The user reviews the draft and publishes it.
- **Polish:** the known open bugs plus a Disconnect Steam button (section 5), and a new app icon. The rest of the Milestone 6 Windows test is a separate task, not part of this milestone.
- **Disconnect** deletes account data only (section 5). **Copy link:** main copies a fixed text. **Fixed at the first release:** `appId`, package name `unified-game-launcher` and repo `Diego-Bonora/UnifiedGameLauncher` stay as they are; the public test releases are 0.9.0 and 0.9.1.
- Build order, one step each: 1) bug fixes + Disconnect, 2) About + privacy policy + licenses, 3) app icon, 4) auto-updates (main + UI), 5) release workflow, 6) Windows test of the whole release path.

## 1. About group (Settings)

The last group on the Settings screen, headed "About":

- The app name (`APP_NAME`) and version (`app.getVersion()`, read through one IPC call; the renderer never hardcodes it).
- "Not affiliated with Valve, Epic Games, GOG, Ubisoft, Blizzard or Electronic Arts." (brand.md).
- "Open source under the MIT License." A **View license** button opens the license text in the app's own dialog.
- **Privacy policy** button: opens the full policy (section 2).
- **Open-source components** button: opens a dialog listing every third-party package the app ships and its license (section 3).
- **Project page:** the GitHub address as selectable text, plus a **Copy link** button. It calls one IPC channel with **no arguments**: main writes a constant (the repo URL, next to `APP_NAME` in `shared/app-info.ts`) to the clipboard with Electron's `clipboard` module. The window can't choose what is copied, and the renderer's permission handlers keep refusing everything, including clipboard writes. A short "Copied" status shows after.
- No web page opens from the app. The window may still open only `steam://` and `com.epicgames.launcher://` URLs (main itself opens Steam's sign-in page, as today; that doesn't change).
- Updates (section 4) sit in this group too.

**Dialogs:** `ModalDialog` gets a long-text variant: a max height inside the window, with the text scrolling and the Close button always visible. Esc or Close closes it, and focus goes back to the button that opened it (the caller's job today, so each About button does it). Checked in the dev app too (StrictMode, lesson 2026-10-03).

Every text here works offline and is bundled with the app (nothing is fetched).

## 2. Privacy policy (in-app text)

It replaces the draft in PROJECT_PLAN.md section 12, which describes features the app doesn't have (store login tokens, a disconnect for every store). The policy is a TypeScript constant in the renderer, with a "Last updated" date that changes whenever its content does. Each statement below was checked against main's code in the spec review; any later feature that adds a network call or a saved file updates the policy in the same commit. In plain words it says:

**What the app keeps on your PC**

- Your public Steam ID.
- Your Steam Web API key and SteamGridDB key, if you add them, encrypted with Windows' built-in protection.
- A saved copy of your Steam library (owned games).
- Cover images for your games: Steam and Epic covers named by each game's id, and for hand-added games a Steam poster or the icon taken from the .exe (both named by the game's own id in the app).
- For Epic covers: the ids of Epic games seen installed, with the date last seen (kept up to 30 days after a game is uninstalled).
- The games you add by hand (title, .exe location, launch arguments).
- Your favorites and your settings.
- A random ID the update checker creates on its first check (`.updaterId` in the data folder). It stays the same between checks and is sent to GitHub with each one (electron-updater's `x-user-staging-id` header; read in its code 2026-10-17, user's call: disclose it).
- The files Electron keeps for itself in the same folder (its cache of downloaded images, window settings). Added after the step 2 review.
- No passwords and no store login tokens. The list of installed games is read fresh each time, not saved.

**Where it's kept**

- Your data: `%APPDATA%\UnifiedGameLauncher`.
- The program: `%LOCALAPPDATA%\Programs\unified-game-launcher`. electron-builder's per-user one-click installer names this folder after the package name, not `productName` (`getWindowsInstallationDirName` in app-builder-lib; corrected 2026-10-17, to be confirmed in step 6).
- A copy of the installer and any downloaded update: `%LOCALAPPDATA%\unified-game-launcher-updater`.

**Who the app talks to**

- **Steam:**
  - The sign-in page opens in your own browser, and the app then asks Steam to confirm the sign-in.
  - The Web API gets your key and Steam ID to read your library.
  - Steam's store service gets the ids of your installed Steam games (also ones you don't own, like free games) to find their covers.
  - Steam's image servers send the covers.
  - Steam's store search gets the titles of hand-added games set to "Steam cover". Games set to "Exe icon" send nothing.
- **SteamGridDB:** only if you add a key. It gets your key and the ids of your installed Epic games; its image server sends the covers.
- **GitHub:** only while "Check for updates automatically" is on, or when you press Check now. It receives a request for the newest version's info, with this install's random update ID and your IP address, like any website, and sends the update files if you choose Download. The ID is not sent with downloads.
- These services have their own privacy policies.

**What the app never does:** ask for passwords; send data to the developer or any server of the developer's; include analytics, tracking or ads.

**How to delete your data**

- **Disconnect Steam** in Settings: deletes your Steam ID, your saved Steam library and the covers of games you don't have installed.
- **Remove** next to each key deletes that key. Covers already saved stay until you delete the data folder.
- Remove a hand-added game from its ⋯ menu.
- Turn off "Check for updates automatically".
- Uninstall the app, then delete `%APPDATA%\UnifiedGameLauncher` and `%LOCALAPPDATA%\unified-game-launcher-updater`. The uninstaller leaves your data, so your library survives a reinstall.

**Contact:** open an issue on the project's GitHub page (the address, as text).

PROJECT_PLAN.md section 12 gets a one-line pointer to this section instead of its draft.

Built in step 2 (`app/src/renderer/src/privacy-policy.ts`) with what the app does today. The GitHub bullet, "Turn off Check for updates automatically", the settings file and the updater's downloads are added in step 4, in the same commit as the updater (the rule above). The installer copy in `%LOCALAPPDATA%\unified-game-launcher-updater` is listed already: every NSIS installer electron-builder makes stores it there.

## 3. License files

- `LICENSE` (MIT, "Copyright (c) 2026 Diego-Bonora") at the repo root, plus `"license": "MIT"` in `app/package.json` (it says `UNLICENSED` today).
- **Components list, generated:** a script in `app/scripts/` runs during `npm run build`. It collects every third-party package that ships:
  - packages bundled into the renderer (React, react-dom, scheduler: devDependencies that Vite bundles);
  - the production dependency tree packaged into app.asar (zod, `@electron-toolkit/*`, `@fontsource-variable/*`, electron-updater and its own dependencies);
  - Electron itself.

  It writes each package's name, version and license id into a generated file the About dialog shows, and copies each license text into `licenses/`.

- **Licenses that aren't MIT** are listed as they are; the review found Python-2.0 (`argparse`), BlueOak-1.0.0 (`sax`) and OFL-1.1 (the fonts). The build fails on a package with no license text or a license id outside a short allow-list of permissive licenses, so a new dependency can't slip in unnoticed.
- The installer ships `licenses/` next to the app (electron-builder `extraResources`). Electron's own license files already ship by default.

## 4. Auto-updates

**Where:** `electron-updater` in main only. It's an npm package, so it must never be reachable from the preload (the build's preload check still guards that). Updates come only from the `publish` block in `electron-builder.yml` (`Diego-Bonora/UnifiedGameLauncher`, GitHub provider), which electron-builder writes into the installed app as `app-update.yml`. The renderer can't change where updates come from.

**Updater settings, set explicitly in code** (not left to defaults, because some defaults break the user's calls):

- `autoDownload = false`: the default `true` would download without asking.
- `autoInstallOnAppQuit` follows the switch (`false` until settings.json is read, and after Restart now). It only has an effect once an update was downloaded.
- `allowPrerelease = false` and `allowDowngrade = false`.

**Never in development:** unpackaged builds don't check (electron-updater skips them, and main doesn't start the timer). The Settings group says "Updates are off in development builds." If electron-updater can't start in an installed copy (it refuses a version that isn't valid semver), the window still opens, nothing is checked, and Settings says "Updates aren't available in this copy." (`updaterUnavailable`).

**Setting:** `checkForUpdates: boolean` in a new `settings.json`. Plain JSON, saved through one queue with temp-file-then-rename like the other stores.

- **No file:** on.
- **A file that exists but can't be read or is invalid** (user's call): **off** for that run. Settings shows "Couldn't read your settings. Updates are off until you turn them on again." The file is never overwritten while it can't be read. Flipping the switch writes a fresh file, and that is the only way out of this state.
- **Off:** the app makes no request to GitHub at all, not even at startup.

**When it checks:**

- About 10 seconds after startup, so the library draws first.
- Every 6 hours while the app is open.
- When the user presses **Check now**, even with the switch off: that one press is a check the user asked for.
- The automatic checks pause while a version is offered, downloading or downloaded: a re-check would hide the sidebar notice while it runs, or change the version under a download. A newer release is picked up at the next app start. (Changed in step 4 from "stop once downloaded".)
- After a failed download the automatic checks go on, so a fixed release can replace a broken one. Main remembers the failed version until a check succeeds: an automatic check that fails (most often the same bad connection) goes back to "download failed" for it, so Download again stays offered. A failed Check now still shows its own message, and the next failed automatic check brings Download again back.
- While such a check runs (at most 60 s every 6 hours), the state is "checking" and the Download again notice is hidden. Accepted.
- A check that timed out forgets the failed version: electron-updater may still finish that request later and switch what Download would fetch, so only a check that succeeds offers a download again.
- **Time limits:** electron-updater's own request timeout never fires under Electron's network module, so main sets its own. A check with no answer after 60 s counts as a failed check. A download is stopped and counts as failed after 2 minutes without progress, or 10 minutes before the first progress report (progress needs the server to send the file size). A request that hangs inside electron-updater can make later checks time out too, until the app restarts.

**States** (one state in main; the window only shows it):
`idle` → `checking` → `upToDate` | `available(version)` | `checkFailed`;
`available` → `downloading(percent)` → `ready(version)` | `downloadFailed` | `available` (switch turned off);
`downloadFailed` → `downloading` (Download again) or `checking` → as above, or back to `downloadFailed` (see "When it checks").

- Only one check or download runs at a time.
- **Check now during an automatic check** joins it, and is then treated as a manual check: its failure shows a message.
- A failure is handled once in main, by catching the call's own promise. electron-updater's `error` event fires too; it is only logged, never turned into a second message.
- Main knows whether the failing call was a check or a download, so the two messages below never mix.

**What the user sees:**

1. **Available:** a small notice at the bottom of the sidebar, above Settings: "Version X.Y.Z is available", with **Download** and **Later**. Later hides it for that version until the app restarts; a download the user then starts for that version undoes Later, so its failure shows again.
2. **Downloading:** "Downloading update… NN%".
3. **Ready:** "Update ready", with **Restart now**. Without a click, the update installs when the user quits the app, if the switch was on when the download finished: electron-updater sets up install-on-quit at that moment only. An update downloaded with the switch off installs only through Restart now, even if the switch is turned on later in that session.
4. **Settings:** the same state as text: "Checking your update settings…" (until main's status is read), "Version X." (before any check, common with the switch off), "You're up to date (version X).", "Checking for updates…", "Version X is available.", "Downloading version X…" with a progress bar and the percent beside it (the text stays the same, so it isn't re-announced every percent), "Ready to install: restart the app.", or a problem. After a failed download its Download button reads "Download again", as in the notice. If the switch can't be saved: "Couldn't save your choice. Try again.", and the switch shows what main still uses. Check now is busy only while its own press waits; during an automatic check it can be pressed and joins that check.

**Problems** (friendly, never raw):

- **The automatic check fails** (offline, or GitHub unreachable): the sidebar shows nothing, and Settings shows "Couldn't check for updates last time." It tries again at the next scheduled check. After a failed download it goes back to "download failed" instead (see "When it checks").
- **Check now fails:** "Couldn't check for updates. Check your internet connection and try again."
- **The download fails:** "The update couldn't be downloaded. Try again later." The notice offers Download again. A broken file is never installed: full and partial downloads are checked against `latest.yml`'s sha512, and a saved download is checked again before reuse (read in electron-updater's code in step 4).
- **Known limit:** if a step after the file was saved and checked fails (for example antivirus locking a helper file), the window shows the download as failed, but with the switch on that checked file still installs on quit.
- **A release has no `latest.yml`** (a mistake in the release): counts as a failed check, and is logged.

**Switch turned off mid-way:**

- **During a check:** that request finishes; no new automatic one starts.
- **While downloading:** the download is cancelled and the version is offered again. A download already past the point where it can stop ends in Ready, and doesn't install on quit.
- **With an update ready:** it no longer installs on quit. Restart now in Settings still works, because that's a click the user asked for.
- **Either way:** the 6-hour timer stops.

**Restart now:** accepted once per run: later presses are refused, because a second request could make electron-updater start a second, silent installer at quit (turning install-on-quit off first, below, also prevents it). It turns install-on-quit off and calls `quitAndInstall` the normal way (a non-silent install that starts the app again when it finishes, NSIS `runAfterFinish`). Main releases the single-instance lock before quitting, so the freshly started copy isn't refused. This is checked on Windows in step 6.

**Unsigned installer:** electron-updater works without code signing. No signing is configured, so `app-update.yml` has no `publisherName` and the update's signature isn't checked (verified in the review). If signing is ever added, this changes on its own; a note in `electron-builder.yml` says so.

**IPC:**

- Channels and types live in `shared/ipc/updates-channels.ts` (no dependencies, so the preload can use it); zod schemas in `shared/ipc/updates.ts`.
- Calls: get state, check now, download, restart and install, set the switch.
- A state-changed event goes from main to the window.
- Every call checks the sender (`security/ipc-sender.ts`) and validates its payload with zod.
- Each call returns a typed result, never a thrown message (lesson 2026-09-20).
- "Restart and install" does anything only when main's own state is `ready`.

## 5. Polish: known bugs and Disconnect

**Stale icon after Change .exe.** If a manual game's .exe is changed to one with no readable icon, main keeps the old exe's icon (`syncIcon` returns early, and `urls()` serves the file whatever `iconFor` says). The old icon must go, and the card shows the placeholder.

**A cover folder that can't be listed is treated as empty.** Two helpers do this: `listFiles()` in `manual-covers.ts` and the shared `listCoverFilesIn` in `library/cover-files.ts` (used by Steam, Epic and `clearCovers`). Both must report "unknown" (lesson 2026-10-15), and every caller must decide what that means:

- the syncs neither delete nor download anything because of it;
- `clearCovers` reports that it failed.

Existing callers that rely on the forgiving behaviour are listed and checked one by one before the change (lesson 2026-10-02).

**Friendly errors come back as typed results, not throws:** `setApiKey`, sign-in and `disconnect` each return a typed result instead of throwing their message (lesson 2026-09-20). The renderer's `saveApiKey` and the `RendererApi` types change with them. `getOwnedGames` still throws when called while not connected, since that only happens through a caller bug; the renderer now shows its own friendly text for it, never the thrown message.

**Disconnect Steam** (user's call: account data only):

- **Button:** in the Steam group, shown while connected.
- **Confirmation** in the app's own dialog: "Disconnect Steam? Your Steam ID, your saved Steam library and the covers of games you don't have installed are deleted from this PC. Installed games stay, and so do your API key and favorites." Buttons: **Disconnect** / **Cancel**.
- **Deletes:** the Steam ID, `library-cache.json`'s Steam library, and the covers of games that aren't installed right now. Installed Steam games and their covers stay; they don't need an account.
- **A library read already running** when Disconnect lands is cancelled, and its result is thrown away. It can't save the library again or start a cover download. Every run started before the disconnect is checked against a generation number taken before it started, not when it finishes.
- **Order:** data first, then the connection. If deleting anything fails, the user stays connected, and a friendly message says "Couldn't remove all your Steam data, so you're still connected. Please try again." The button stays, so they can retry. Disconnect never deletes the API key (auth-roles.md).
- **Tests:** a read in flight, a delete that fails, and an installed game's cover surviving.

## 6. App icon

- A new icon drawn from basic shapes (no copied paths, lesson 2026-10-03). It is a violet (`#8B5CF6`) mark on the dark background, readable at 16 px, and unlike any store's logo (brand.md). It replaces the electron-vite template icon in `build/icon.ico`, `build/icon.png` and `resources/icon.png`.
- The SVG source is kept in `build/icon.svg`. A script in `app/scripts/` generates the PNG and the ICO (16, 24, 32, 48, 64, 128, 256 px) from it with the project's own tools (it renders the SVG in Electron), so the result can be rebuilt.
- Shown to the user as a screenshot at 16, 32 and 256 px before it's committed.

## 7. Release workflow

- **Two triggers, told apart by the event that started the run (`github.event_name`), not by the ref** (a manual run can also start on a tag):
  - **Manual run (`workflow_dispatch`):** build only, as today. electron-builder always gets an explicit `--publish never`, so it never publishes on its own because it sees a tag.
  - **Tag push:** builds **once** with `--publish always` into a **draft** release (`releaseType: draft` in `electron-builder.yml`). The source check inspects that same build, so the file that is checked is the file that is uploaded. electron-builder uploads the installer, its `.blockmap` and `latest.yml`.
- **Token:** only the tag job gets `contents: write`; the rest of the workflow stays `contents: read`. electron-builder reads the workflow's `GITHUB_TOKEN`.
- **Checks before building:** CI fails if the tag isn't exactly `v` + the `version` in `app/package.json`, or isn't plain `vX.Y.Z` (a `-rc` style version would turn on prerelease updates by itself). It also fails if a **published** release for that tag already exists. electron-builder would skip the upload and still pass.
- **Check after uploading:** CI confirms that the draft holds all three files, and fails if any is missing.
- The user publishes the draft by hand after a look; only then do installed copies see it.
- **Versions:** first the test releases `0.9.0` and `0.9.1`, used to try a real update on Windows. They are public; anyone who finds the repo can install them, which is fine (user's call). Then `1.0.0` for friends. Updates never go back to a lower version, so a bad release is fixed with a newer one. Release notes are written by hand in the draft.

## 8. Windows test (step 6)

On the user's PC, with real releases:

1. Install 0.9.0 from the published release. SmartScreen's "More info → Run anyway" is expected.
2. Settings → About: version 0.9.0, the license, privacy and components dialogs (each scrolls, Esc closes, focus comes back), and Copy link (paste it into Notepad).
3. Publish 0.9.1, then restart 0.9.0. The notice appears within about 10 s. Download, watch the progress, then press Restart now. Pass when:
   - the app comes back by itself as 0.9.1 (not just closing);
   - the library, keys and favorites are intact;
   - you've noted whether SmartScreen appeared.
4. Switch off, then restart: no notice. Check now still works.
5. Check now offline (Wi-Fi off): the friendly message appears, and nothing else breaks.
6. Quit with an update downloaded but not installed: it installs on quit. Turn the switch off with an update ready, then quit: it doesn't install.
7. Disconnect Steam: owned games and their covers go; installed games and their covers stay; the key stays.
8. The new icon in the taskbar, Start menu, desktop shortcut and installer.

## Out of scope

- Code signing, beta or prerelease channels, release notes shown in the app (the notice shows only the version).
- Opening any web page from the app.
- Renaming the app.
- The rest of the Milestone 6 Windows test (its own task).

## Open items (each checked in the step that needs it)

- Whether an update installed by electron-updater triggers SmartScreen for an unsigned app (step 6).
- Whether the new copy started after Restart now ever loses to the old one's single-instance lock (step 6).
- ~~Whether electron-updater checks the download against `latest.yml`'s sha512, and how a missing `latest.yml` surfaces.~~ Read in step 4: both checked (see "The download fails"); a missing `latest.yml` or no release rejects the check (`ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`, "No published versions on GitHub").
- If electron-updater can't start the installer after Restart now (no downloaded file found), the app doesn't quit and Restart stays refused for that run. Rare; accepted in step 4.
