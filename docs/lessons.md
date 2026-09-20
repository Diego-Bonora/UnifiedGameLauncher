# Lessons Learned

<!-- Updated during /close when something new is learned or corrected -->
<!-- Read at the start of every session via /start -->
<!-- Most recent entry at the top -->

<!-- Format:
## [DATE] — [short title]
**What happened:** [description of what went wrong or was discovered]
**Rule going forward:** [the concrete actionable rule to follow next time]
-->

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
