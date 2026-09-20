# Lessons Learned

<!-- Updated during /close when something new is learned or corrected -->
<!-- Read at the start of every session via /start -->
<!-- Most recent entry at the top -->

<!-- Format:
## [DATE] — [short title]
**What happened:** [description of what went wrong or was discovered]
**Rule going forward:** [the concrete actionable rule to follow next time]
-->

## 2026-09-20 — Scope question misread as "include"
**What happened:** In the Session Zero interview, a multi-select "which should be OUT of v1?" listed auto-updates. The user ticked it thinking they were saying yes to auto-updates, so it was first recorded as out of scope and had to be reversed.
**Rule going forward:** In scope interviews, ask one direction per question ("Which features do you want IN v1?") and avoid options phrased as "keep out". Read the answer back in plain words before writing it to docs/spec.md.

## 2026-09-20 — Session prompt had an unfilled placeholder
**What happened:** The Session Zero prompt still contained `[DESCRIBE YOUR APP IN 2-3 SENTENCES HERE]`. The real description was in docs/sources/PROJECT_PLAN.md.
**Rule going forward:** When a prompt has an unfilled placeholder, check docs/sources/ first and say which document is being used as the source of truth.
