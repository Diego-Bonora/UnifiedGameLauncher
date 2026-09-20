# /close — Session Close

Run this before every /clear or when you are done working for the session.
Never skip this — it is the step that makes the next session productive.

## What this does
Updates progress.md with what was built, adds lessons learned,
rotates old entries to the archive, and gives you a commit message
so the session is fully captured.

## Instructions for Claude

1. Scan the git diff to understand everything changed this session:
   ```
   git diff HEAD
   ```

2. Update @docs/progress.md — structure it as follows every time:
   ```markdown
   # Progress

   > Full history in docs/progress-archive.md

   ## Current State
   [2-3 sentences on where the project stands right now]

   ## In Progress
   [what is actively being worked on]

   ## Next Up
   [the single most important next task]

   ---

   ## [TODAY'S DATE] ← newest entry
   **Built:** [specific files and features — be precise]
   **Decisions:** [architectural or product decisions and why]
   **Next:** [most logical next task]
   **Blocked by:** [anything blocking, or "nothing"]

   ## [PREVIOUS DATE]
   [second most recent entry — keep as-is]

   ## [PREVIOUS DATE]
   [third most recent entry — keep as-is]
   ```

   Only keep the 3 most recent dated entries in progress.md.

3. Rotate older entries to @docs/progress-archive.md:
   - If progress.md has more than 3 dated session entries,
     move the oldest ones to the top of progress-archive.md
   - Create progress-archive.md if it doesn't exist yet
   - Never delete entries — only move them
   - Format in archive: append above existing entries, newest at bottom

4. Check file size discipline:
   - progress.md should stay under 8,000 characters
   - If it's still large after rotation, trim the Current State
     and In Progress sections to be more concise

5. Check if anything belongs in @docs/lessons.md:
   - Only add if something genuinely new was learned or corrected
   - Be specific — vague lessons are useless

6. If a skill Gotcha was discovered, update the relevant skill file

7. Suggest a git commit message in this format:
   ```
   [feat|fix|refactor|docs|chore]: [one-line description]
   ```

8. Tell the user: "You're ready to commit and /clear."

## Rules
- progress.md entries must be specific, not vague
- progress.md must never grow beyond 3 session entries — rotate religiously
- progress-archive.md is never loaded automatically — it is history only
- If it was a planning-only session, still log it — decisions are progress
- Do not modify spec.md here — that belongs to the new-feature workflow

## Gotchas
- Do not summarise or compress old entries when moving to archive —
  move them verbatim so history is never lost
- The Current State section is the most important part of progress.md —
  it's what /start reads to orient Claude at the beginning of every session
  Make it accurate and specific, not generic