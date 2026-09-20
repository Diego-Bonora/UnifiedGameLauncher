# Lessons Learned

<!-- Updated during /close when something new is learned or corrected -->
<!-- Read at the start of every session via /start -->
<!-- Most recent entry at the top -->

<!-- Format:
## [DATE] — [short title]
**What happened:** [description of what went wrong or was discovered]
**Rule going forward:** [the concrete actionable rule to follow next time]
-->

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
