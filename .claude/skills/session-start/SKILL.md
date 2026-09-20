---
name: session-start
description: >
  Activate when the user opens a session and wants to start working, 
  mentions "let's start", "good morning", "continuing from yesterday", 
  "where were we", "let's work on", or any warm-up phrase that signals 
  the beginning of a new work session. Also activates when the user 
  runs /start or asks Claude to read context files before beginning work.
---

# Session Start Workflow

## Purpose
Load full project context at the start of every session so Claude 
has accurate, up-to-date understanding before any work begins.
Never skip this — working without context leads to decisions that 
conflict with existing architecture, duplicate work already done, 
or miss critical constraints.

## Steps to Execute Automatically

### 1. Read context files in this order
```
@docs/progress.md     — what has been built and current state
@docs/spec.md         — what the product is and what it should do
@docs/lessons.md      — mistakes made, corrections, gotchas to avoid
@CLAUDE.md            — project conventions, stack, dev commands
```

### 2. Produce a structured summary
After reading, always respond with this structure:

**Project:** [one line description from spec.md]  
**Current state:** [what progress.md says is done and in progress]  
**Next up:** [what progress.md says is next]  
**Active constraints:** [any relevant lessons or rules to keep in mind today]  

### 3. Ask one confirming question
"What would you like to work on today?"

Wait for the answer before doing anything else.

## Rules
- Never start working before completing the summary
- If any of the context files are missing, flag it immediately
  and ask the user to create them before proceeding
- If the summary reveals a conflict or something unclear,
  surface it now — not mid-implementation
- Do not load all docs/* files speculatively — only the four listed above
  Additional docs load contextually when the task requires them

## Gotchas
- Do not assume progress.md is up to date — if it looks stale, say so
- lessons.md is the most important file to read carefully; 
  it contains hard-won corrections that prevent repeated mistakes
