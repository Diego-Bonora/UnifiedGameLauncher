# Lessons Learned

<!-- Updated during /close when something new is learned or corrected -->
<!-- Read at the start of every session via /start -->
<!-- Most recent entry at the top -->

<!-- Format:
## [DATE] — [short title]
**What happened:** [description of what went wrong or was discovered]
**Rule going forward:** [the concrete actionable rule to follow next time]
-->

## 2026-10-03 — Checked new dialogs only in the production build; in dev every dialog closed itself
**What happened:** The Milestone 6 dialogs (native `<dialog>`) were checked in the app through the production build, where they worked. A review then spotted that React StrictMode (on in dev only) runs effects twice: the cleanup's `dialog.close()` fired a late `close` event that the second run's handler took as "the browser closed it" and cancelled. In `npm run dev` every Add/Rename/Remove dialog would have flashed and vanished. Confirmed by removing the fix and running the dev app headless with a debug port.
**Rule going forward:** Check new UI in the dev app too (`npx electron-vite dev --remoteDebuggingPort=9333 --noSandbox` under `xvfb-run` in the cloud container), not only the build. Effects that call imperative browser APIs (showModal/close, focus, listeners) must survive mount → cleanup → mount, and event handlers must check the element's current state, not assume the event is fresh.

## 2026-10-03 — A background sync that notifies the window, which then asks for the list, which starts the sync
**What happened:** The manual-cover sync ran on every list read and told the window "covers changed" whenever it wrote a file. If its bookkeeping couldn't be saved (a locked `manual-games.json`) or a leftover file couldn't be deleted, every sync rewrote the same icons and notified again, and the window's reload would have started the next sync: an endless loop, caught by review before the listener existed.
**Rule going forward:** Any "work → notify → caller re-reads → work" chain needs a guard that holds even when every save fails: try each item at most once per session in memory, and count a change only when it really happened (a delete that worked, a file actually written). Test it with the save and delete both failing and assert the second run neither writes nor notifies.

## 2026-10-03 — Batched exact-text edits partly applied after Prettier reflowed a file
**What happened:** Several multi-file Python edit batches asserted an exact old text per file. Prettier had reflowed some files since they were read, so one assert failed mid-batch: the files before it were changed, the ones after weren't, and a later regex fix even deleted a neighbouring schema line. Each time the result had to be re-read and repaired.
**Rule going forward:** After running Prettier, re-read a file before editing it by exact text. Keep edit batches small, check which edits applied when one fails, and avoid multi-line regex replacements on code; prefer one anchored, unique replacement and grep the result.

## 2026-10-03 — Assumed every installed Steam game is in the owned list
**What happened:** The library layout spec had installed Steam cards borrow their cover from the owned library by `appId`. On Windows, Brawlhalla, Warframe and Unturned (free-to-play) and Forager (Family Sharing) showed placeholders: `GetOwnedGames` leaves free games out unless `include_played_free_games` is set, and shared games aren't owned at all. The spec even listed "installed but not owned" as a known limit, but nobody checked how common it was. One plain `IStoreBrowseService/GetItems` request then showed covers exist for all four, without a key.
**Rule going forward:** When one data source fills in another (covers by id, titles by id), write down what the source leaves out (read its parameters) and check the real data for how many items fall through before calling it an edge case. Plan the fallback in the spec, not after the user notices.

## 2026-10-03 — Sized the sidebar with Tailwind's default 4 px scale; this project's is 8 px
**What happened:** The first sidebar was `w-56`, meant as 224 px. `main.css` sets `--spacing: 8px`, so it rendered at 448 px with a 32 px gear icon. The CDP screenshot caught it before the user saw it. The same scale also hid an 8 px padding that cut off the app name.
**Rule going forward:** In this project one spacing unit is 8 px: `w-28` = 224 px, `h-2` = 16 px, `px-1` = 8 px, `gap-3` = 24 px. Halve the number you'd write for stock Tailwind, and check new layout with a CDP screenshot (`Page.captureScreenshot`, `Emulation.setDeviceMetricsOverride` for widths) before handing it over.

## 2026-10-03 — Reused a well-known icon path, which CLAUDE.md forbids
**What happened:** For the sidebar's Settings icon I first wrote the SVG path of a popular open-source icon set's gear from memory. CLAUDE.md says no code copied from other projects; I noticed and replaced it with a gear drawn from scratch (ring, hub, eight teeth).
**Rule going forward:** Draw icons from basic shapes (`circle`, short `path` lines) and say so in a comment; never type out a path from an icon library, even from memory.

## 2026-10-03 — `kill $PIDS` in zsh passed every PID as one argument
**What happened:** Stopping the dev app with `P=$(...); kill $P` failed with "illegal pid": zsh doesn't word-split unquoted variables, so `kill` got "54840 54841 …" as a single argument and nothing was stopped.
**Rule going forward:** Write the PIDs to a file and use `xargs kill < file`, or list them literally. Still confirm with `ps` and `curl` on the debug port afterwards.

## 2026-10-02 — Four review fixes each introduced a new bug in the same sync/status logic
**What happened:** In the Epic cover work, a fix to one finding broke something nearby four times: "posters we can't use" became `unavailable`, which halted the whole run for every game; a state-file failure set `unavailable` over a `keyRejected` that then never cleared; setting `lastSynced` before the sync locked out retries after a failed startup sync; and skipping the sync with no key silently dropped the folder housekeeping the spec required. Each was caught only by the next review round, so Steps 2 and 3 needed three rounds each.
**Rule going forward:** Before changing a status, flag or "already done" marker, list every place that reads or clears it and check what the new value does there (halts, retries, notifications, other games in the same run). Prefer per-item outcomes (`unusable`) over reusing a global one (`unavailable`). Write the test for the neighbouring behaviour as well as the fixed one, mutation-check it, and expect to re-review a fix to state-machine code.

## 2026-10-02 — A user's API key ended up in the chat while being saved to a file
**What happened:** To keep the SteamGridDB key out of the transcript, I asked the user to copy the key and then run `! pbpaste > <file>`. They copied the command (to paste it), so the file got the command text instead of the key; on the retry they typed the key after the command, which put it in the transcript. I checked the file's length and character set without printing it (that check is what caught the first mistake), but my instructions didn't cover the order of steps.
**Rule going forward:** When a secret must go into a file, give the steps in order: paste the command into the prompt without pressing Enter, then copy the secret, then press Enter. Say plainly "never type the key into the chat". Verify the file by shape (length, charset) without printing it. If a secret does reach the chat, say so at once and ask the user to rotate it; don't use a leaked key for anything that will outlive the session.

## 2026-10-02 — A background `npm run dev` was killed after 30 minutes while the user was testing
**What happened:** The dev app handed to the user for a manual test was started with the default background limit and was stopped at 30 minutes, before the user had tested.
**Rule going forward:** When the dev app is for the user to try, start it with the longest background timeout (2 h) and say when it will stop, or give them the exact command to run in their own terminal. Note that the dev app's data lives in `%APPDATA%`/`Application Support` under `UnifiedGameLauncher (dev)`, not the release folder.

## 2026-09-21 — Built on an assumed Epic manifest shape and an assumed "public" endpoint; the real thing differed
**What happened:** Every Epic fixture and test assumed a base game's `MainGameAppName` equals its `AppName`, and a reviewer said that "matches real Epic manifests" without checking. Two real manifests from a Windows PC showed it is an EMPTY string. The parser survived only because it happened to treat empty as "no information". I also passed the wrong assumption into the prompt for the Windows session. Separately, an Epic endpoint described as "unauthenticated" answered a Cloudflare browser challenge (403) to a plain client, and the launcher catalog service answered 401, so the plan of getting covers without a login failed. A single plain request found that out in minutes.
**Rule going forward:** For any third-party file format or endpoint, capture a real sample (or make one plain request) before building fixtures or a plan on it. Treat a reviewer's or a write-up's claim about a third-party format as unverified until then. Write fixtures in the real captured shape and add a test from the real sample. "No auth needed" claims must be tried with a plain non-browser request from the kind of client the app will be.

## 2026-09-20 — Ran /review after committing, so every step needed a fix-up commit
**What happened:** Milestone 3 Steps 1–3 were committed first and reviewed second. Every review found real problems, so the history gained three "address review" commits on top of the three feature commits. The user asked "why not review first then commit?"; the `/review` skill is written to run before the commit, and only B1 followed that.
**Rule going forward:** Review before committing. New files are untracked and make `git diff HEAD` empty, so run `git add -N <new files>` first (index only, no content change), review the working-tree diff, fix, run tests and `npm run build`, then commit once. Commit before review only if the user asks for it.

## 2026-09-20 — A cache must never let a bad or empty answer replace a good one
**What happened:** Reviews found four ways a saved copy could be ruined: (1) a 200 response with an empty body was saved as a 0-byte `.jpg`, and "file exists = valid" then hid the working remote URL forever; (2) an empty owned-games answer (private profile, odd 200 body) overwrote a good saved library; (3) the 5 MB cover cap was checked only after the whole body was buffered; (4) an older snapshot's remote URL could overwrite a newer local one in the renderer.
**Rule going forward:** Validate downloaded content by its bytes (magic numbers), not headers or existence. Enforce size caps while streaming. Never overwrite non-empty saved data with an empty result: keep the saved copy and report a problem. Only ever let a view upgrade (remote to local), never downgrade. Write each of these as a test.

## 2026-09-20 — Errors thrown from an Electron IPC handler reach the renderer with a prefix
**What happened:** A reviewer pointed out that `throw new Error("You're offline...")` in an `ipcMain.handle` reaches the renderer as `Error invoking remote method 'steam:getOwnedGames': Error: You're offline...`. This is known Electron behavior; I did not reproduce it in the app. It breaks "friendly messages, never raw errors".
**Rule going forward:** Return expected outcomes (offline, key rejected, nothing saved) as typed data, like `SteamLibraryResult`, and let the renderer word them. Throw only for caller bugs. Still open: `setApiKey` throws its friendly message and needs the same change.

## 2026-09-20 — Simulating offline, and reading the window without a screenshot
**What happened:** To test the offline path without touching Wi-Fi (the session needs the network), the dev app was started with `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9 npm run dev` (needs Node 22.21+; Electron 39 ships 22.22). That makes the main process's `fetch` fail like being offline. It also broke Steam sign-in verification, so the user's "Reconnect Steam" silently failed until the app was restarted normally. That same failure exposed a real bug: `openid.ts` has no `.catch` on the verification promise.
**Rule going forward:** Say up front what a simulation breaks, and restart the app normally before handing it back. To read what the window really shows, run `npm run dev -- --remoteDebuggingPort=9222` and use a small Node script (global `WebSocket`, `Runtime.evaluate` on the page target from `http://127.0.0.1:9222/json`), for example counting `<img>` URLs. Afterwards restart without the flag and check that `curl http://127.0.0.1:9222/json` fails. Stop processes by exact PID as always.

## 2026-09-20 — `npm run dev` doesn't restart the main process on its own file changes
**What happened:** While testing Milestone 2 Steps 2–4, `npm run dev` was left running across several rounds of edits to `src/main/**` (new IPC handlers, new store modules). The renderer hot-reloads live via Vite HMR, so the UI visibly updated (new form fields, new sections), creating the impression the whole app had picked up the change — but electron-vite only builds and launches the main process once at startup; it never rebuilds or restarts it when `main/`/`preload` files change on disk. This produced "No handler registered for 'steam:xyz'" errors twice: the renderer (fresh) called a channel a main process (stale) had never registered.
**Rule going forward:** Any edit under `src/main/**` or `src/preload/**` needs the dev process tree killed by exact PID (`ps -eo pid,ppid,command | grep <project path>`, per the existing PID-kill rule below) and `npm run dev` started fresh — there is no live-reload for main/preload. Renderer-only and shared-only edits (nothing under `src/main`/`src/preload`) DO reload live in an already-open window with no restart needed — confirmed for both a component-only change (HMR) and a CSP-only `index.html` change (full page reload, still automatic). Check the dev log for "electron main process built successfully" appearing again after an edit as the tell for whether a restart actually happened.

## 2026-09-20 — Embedded Electron window got blocked by Steam's Akamai WAF during OpenID sign-in
**What happened:** Milestone 2's Steam OpenID sign-in was first built as a secondary in-app `BrowserWindow` (isolated session, navigation intercepted via `will-navigate`/`will-redirect`) pointed at `steamcommunity.com/openid/login`. On the first real test, Steam's Akamai edge returned an "Access Denied" WAF page instead of the login page — almost certainly because Electron's embedded window sends a default User-Agent containing `Electron/x.y.z`, which bot-detection blocks. This also went against CLAUDE.md's own Stack line ("Auth: store login pages in the browser"), which was misread during planning as "an in-app browser window" instead of "the user's actual default browser."
**Rule going forward:** Store login pages (OpenID/OAuth) must open in the user's real system browser via `shell.openExternal`, never an embedded `BrowserWindow` — some providers block embedded webviews outright (Google's OAuth policy rejects them regardless of provider). Since there's no in-app window to detect "the user closed it," catch the callback with a real loopback HTTP server on `127.0.0.1` (ephemeral port) instead, matching how CLI tools like `gh auth login` handle desktop OAuth. Re-read CLAUDE.md's Stack section literally before assuming an implementation detail it already answered.

## 2026-09-20 — A shared "already settled" flag across async sign-in flows raced and hung the second one
**What happened:** The Steam OpenID sign-in flow (`openid.ts`) used a single module-level `pending` variable both to track "is a flow in progress" and, inside each flow's `settle()`, to guard against firing twice (`if (pending === null) return`). Cancelling a flow while its network verification was still in flight, then immediately starting a new one, let the *old* flow's delayed settle callback see the *new* flow's `pending` value, wrongly clear it, and leave the new flow's own `settle()` permanently guarded off — its real callback arrived later but the shared guard fired first, hanging that promise forever and leaking its HTTP server. Found by a `/review` pass, not manual testing — the happy path alone never surfaces it.
**Rule going forward:** A "have I already settled" guard must be local to each async flow (a `let settled = false` inside that flow's own closure), never a flag shared across concurrent instances of the same operation. If flows also coordinate through shared state (e.g. "only one may be active at a time"), clear that shared slot only via an identity check against the current flow, not a plain null/falsy check. Reuse this for any future loopback login flow (Epic's was dropped on 2026-10-02) — copy the fixed shape in `openid.ts`, not the shape of the bug.

## 2026-09-20 — Sandboxed preload silently died on an npm import, blanking the window
**What happened:** `preload/index.ts` imported `STEAM_CHANNELS` from `shared/ipc/steam.ts`, which also defines zod schemas at the top of that same file. electron-vite doesn't bundle npm dependencies into main/preload output (normal Node-style externalization) — fine for `main` (plain `require`), but `sandbox: true` preload runs in Electron's restricted loader, which can only `require()` a small built-in allowlist, not arbitrary node_modules. `require('zod')` failed, the preload threw before calling `contextBridge.exposeInMainWorld`, so `window.api` stayed `undefined` and the React tree crashed on mount — the window just showed the dark background color with nothing on it, which looked like a black screen. Found it by temporarily adding a `webContents.on('console-message', ...)` forwarder in `main/index.ts` (removed after) to see the renderer's actual console output.
**Rule going forward:** Anything reachable from `preload/index.ts`'s import graph must stay dependency-free (only plain TS types/constants). Split shared IPC files so channel names/types (zero deps) live separately from zod schemas (main-only) — see `shared/ipc/steam-channels.ts` vs `shared/ipc/steam.ts`. A blank/black window in dev is a preload-crash symptom worth checking via `console-message` before assuming a CSS/theming issue. `npm run build` now fails automatically if this recurs — `scripts/check-preload-deps.mjs` scans the built preload bundle for any npm `require`/`import` — so a future recurrence should show up as a build failure, not a black window.

## 2026-09-20 — Guessed what "run it here" meant and tried a download
**What happened:** The user said "can you run it here so I can compare?" I assumed it meant downloading the CI installer to ~/Downloads and started that command. They rejected it: they meant `npm run dev` on the Mac, to compare it with the installed build on the PC.
**Rule going forward:** When "run/open/test it" could mean more than one thing (dev app vs. built installer vs. CI job), ask which one in a single line before touching files outside the repo. Also: GitHub artifact links return 404 (not a login prompt) when signed out, so check sign-in before assuming the link is broken.

## 2026-09-20 — PID-tree kill loop hung on an empty `pgrep -P`
**What happened:** To stop the dev server by exact PID, I wrote a shell loop that walked child PIDs with `pgrep -P`. When the list of PIDs went empty, macOS `pgrep -P` printed usage and the loop never ended, so nothing was killed and the command timed out at 120s. The processes were then killed by listing PIDs from `ps` first.
**Rule going forward:** Don't loop on `pgrep -P`. List the tree once with `ps -eo pid,ppid,command | grep <full project path>`, check every line belongs to this project, then `kill` those exact PIDs and confirm with `ps -p`.

## 2026-09-20 — Vite inlines small assets as data: URIs, which the CSP blocks
**What happened:** With bundled fonts, Vite inlined one font under 4 KB as a `data:` URI. The CSP has no `data:` for fonts, so it would have been refused. The `/review` subagent caught it; the build looked fine.
**Rule going forward:** The renderer keeps `assetsInlineLimit: 0`. When adding assets, check the built CSS/HTML for `data:` URIs. Don't loosen the CSP to fix it.

## 2026-09-20 — Broad pkill killed an unrelated app's process
**What happened:** After a test run of `npm run dev`, cleanup used `pkill -f "Electron"`. VS Code is also an Electron app, so the pattern matched one of its helper processes (its crash reporter). Nothing important broke, but it could have been worse.
**Rule going forward:** Stop background processes by exact PID (`$!` from the launch, or `pgrep -f` on the full project path), never by a generic name like "Electron" or "node". Also, macOS has no `timeout` command; run in the background and kill by PID.

## 2026-09-20 — Untracked new folders make `git diff` empty
**What happened:** `/review` and `/close` start from `git diff HEAD`, but `app/` was entirely untracked, so the diff showed nothing and the reviewer had to be pointed at the files directly.
**Rule going forward:** For a brand-new folder, review the files directly (or commit or `git add -N` first). The `/review` template also mentions Firebase and Python, which this project doesn't use, so adapt its checklist to the Electron security rules in CLAUDE.md.

## 2026-09-20 — Scope question misread as "include"
**What happened:** In the Session Zero interview, a multi-select "which should be OUT of v1?" listed auto-updates. The user ticked it thinking they were saying yes to auto-updates, so it was first recorded as out of scope and had to be reversed.
**Rule going forward:** In scope interviews, ask one direction per question ("Which features do you want IN v1?") and avoid options phrased as "keep out". Read the answer back in plain words before writing it to docs/spec.md.

## 2026-09-20 — Session prompt had an unfilled placeholder
**What happened:** The Session Zero prompt still contained `[DESCRIBE YOUR APP IN 2-3 SENTENCES HERE]`. The real description was in docs/sources/PROJECT_PLAN.md.
**Rule going forward:** When a prompt has an unfilled placeholder, check docs/sources/ first and say which document is being used as the source of truth.
