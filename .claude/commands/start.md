# /start — Session Warm-Up

Run this at the beginning of every work session before doing anything else.

## What this does
Reads all core context files, produces a structured summary of the 
current project state, and confirms what you want to work on today.

## Instructions for Claude

1. Read these files immediately:
   - @docs/progress.md
   - @docs/spec.md
   - @docs/lessons.md
   - @CLAUDE.md

2. Respond with this exact structure:

---
**Project:** [one-line description]
**Current state:** [what is built and what is in progress]
**Next up:** [what progress.md identifies as the next task]
**Watch out for:** [top 1-2 items from lessons.md relevant to today]
---

3. Ask: "What would you like to work on today?"

## Rules
- Do not start any work until the summary is confirmed
- If any context file is missing, flag it before proceeding
- If progress.md looks stale or inconsistent with spec.md, say so
