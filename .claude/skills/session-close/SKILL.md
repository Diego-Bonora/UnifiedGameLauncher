---
name: session-close
description: >
  Activate when the user signals they are done working, mentions 
  "wrapping up", "that's it for today", "let's stop here", "I'm done",
  "closing the session", "before I go", "let's commit", or any phrase 
  that signals the end of a work session. Also activates when the user 
  runs /close.
---

# Session Close Workflow

## Purpose
Capture what was built, decisions made, and lessons learned before 
closing the session. This is the step that makes the next session 
productive — if skipped, context is lost and the next session starts 
blind.

## The Core Rule
**Never /clear before closing. Always close before /clear.**

The session's value lives in what you write to the files.
The conversation is disposable. The files are permanent.

## Steps to Execute Automatically

### 1. Summarise the session
Produce a brief internal summary before writing anything:
- What was built or changed
- What decisions were made and why
- Any mistakes made and how they were corrected
- What is unfinished or next

### 2. Update docs/progress.md
Rewrite the file on every close — do not just append.
Keep the structure tight every single time:

```markdown
# Progress

> Full history in docs/progress-archive.md

## Current State
[2-3 sentences — where the project stands right now, be specific]

## In Progress
[what is actively being worked on]

## Next Up
[the single most important next task]

---

## [TODAY'S DATE]
**Built:** [specific files and features — be precise]
**Decisions:** [decisions made and why]
**Next:** [most logical next task]
**Blocked by:** [anything blocking, or "nothing"]

## [PREVIOUS SESSION]
[second most recent entry — keep verbatim]

## [PREVIOUS SESSION]
[third most recent entry — keep verbatim]
```

Only 3 dated session entries stay in progress.md at any time.

### 2b. Rotate old entries to docs/progress-archive.md
If progress.md has more than 3 dated session entries after writing,
move the oldest ones to docs/progress-archive.md verbatim.
Create the file if it doesn't exist.
Never delete entries — only move them.
progress-archive.md is never loaded automatically — it is history only.

### 3. Update docs/lessons.md if anything new was learned
Only add an entry if something genuinely new happened:
- Claude made a mistake that required correction
- An unexpected behaviour was discovered in the stack
- A pattern emerged that should be reused
- A shortcut was taken that should be noted

Format:
```markdown
## [DATE] — [short title]
**What happened:** [description]
**Rule going forward:** [the concrete rule to follow next time]
```

### 4. Update relevant skill Gotchas if applicable
If Claude made a mistake specific to Firebase, React, auth, or any 
domain covered by a skill — add it to that skill's Gotchas section:
```
@.claude/skills/[relevant-skill]/SKILL.md
```

### 5. Prompt the user to commit
Say:
"Ready to commit. Suggested message:
`[type]: [one-line description of what was built]`

Run /clear when you're done — your context files are updated."

## Rules
- progress.md entry must be specific — "worked on auth" is not acceptable,
  "implemented Firebase Auth token validation in /functions/main.py" is
- If nothing was built (pure planning session), still log it — decisions are progress
- Do not update spec.md in the close workflow unless explicitly asked
  spec.md changes belong to the new-feature workflow, not here

## Gotchas
- If the session was long and touched many files, scan git diff before 
  writing progress.md to make sure nothing is missed
- lessons.md entries written vaguely are useless — 
  "be careful with auth" teaches nothing; 
  "Firebase callable functions require req.auth check before any 
  Firestore operation or unauthenticated users can call the function" is actionable
- progress.md must never exceed 3 session entries — rotate religiously
  or it will grow to 50k+ chars and degrade performance on every /start
- The Current State section is the most important part — 
  it's what orients Claude at session start. Keep it accurate and specific