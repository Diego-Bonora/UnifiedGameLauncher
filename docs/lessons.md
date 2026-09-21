# Lessons Learned

<!-- Updated during /close when something new is learned or corrected -->
<!-- Read at the start of every session via /start -->
<!-- Most recent entry at the top -->

<!-- Format:
## [DATE] — [short title]
**What happened:** [description of what went wrong or was discovered]
**Rule going forward:** [the concrete actionable rule to follow next time]
-->

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
**Rule going forward:** A "have I already settled" guard must be local to each async flow (a `let settled = false` inside that flow's own closure), never a flag shared across concurrent instances of the same operation. If flows also coordinate through shared state (e.g. "only one may be active at a time"), clear that shared slot only via an identity check against the current flow, not a plain null/falsy check. This pattern will get reused for Epic's OAuth loopback flow (Milestone 4) — copy the fixed shape in `openid.ts`, not the shape of the bug.

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
