# Claude Code Project Template

A production-ready starter template for new projects using Claude Code.
Use this template and you get the full scaffold — skills, commands, doc
structure, hooks, and the exact prompts to run on day one.

---

## What's Included

```
.claude/
├── skills/
│   ├── session-start/    # auto-activates on warm-up phrases
│   ├── new-feature/      # auto-activates on new scope discussion
│   └── session-close/    # auto-activates on wrap-up phrases
├── commands/
│   ├── start.md          # /start — session warm-up
│   ├── close.md          # /close — session close + progress update
│   ├── new-feature.md    # /new-feature — spec-first feature workflow
│   └── review.md         # /review — staff engineer code review
└── settings.json         # hooks config (formatter placeholder)

docs/
├── spec.md               # what the product is
├── progress.md           # what has been built
├── lessons.md            # mistakes and corrections
├── design/
│   └── direction.md      # visual language and UI direction
└── features/
    └── auth-roles.md     # roles and permission rules

CLAUDE.md                 # project conventions (filled in during Session Zero)
.gitignore
```

---

## How to Use This Template

### Step 1 — Create a new repo from this template

On GitHub click **"Use this template"** → **"Create a new repository"**.
Do not fork — template creates a clean repo with no shared history.

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_PROJECT_NAME
cd YOUR_PROJECT_NAME
```

### Step 2 — Install global tools (once per machine, not per project)

```bash
npm install -g @anthropic-ai/claude-code
npm install -g firebase-tools   # only if using Firebase
firebase login                  # only if using Firebase
```

### Step 3 — Open Claude Code inside your project folder

```bash
claude
```

> ⚠️ Do not run `/init` — this template already has CLAUDE.md and the
> full .claude/ structure. Running /init would overwrite it.

### Step 4 — Run Session Zero

Session Zero is a planning-only session. No code gets written.
Its purpose is to define your product, roles, design direction,
and tech stack so every future session starts with full context.

Copy and paste this prompt as your very first message:

---

#### 🚀 SESSION ZERO PROMPT

```
I'm starting a new project and I want to set it up properly 
from day one.

Before writing any code, help me build the full project scaffold.
Stay in Plan Mode for this entire session — no implementation today.

Here is what I want to build:
[DESCRIBE YOUR APP IN 2-3 SENTENCES HERE]

Follow these steps in order:

1. Scan @docs/ and @docs/sources/ for any existing content.
   Read everything you find. Use it to understand what's 
   already defined so you don't re-ask what's already answered.

2. Identify the gaps — what is NOT yet defined across:
   - Product vision and features
   - Users and roles
   - Design direction and visual language
   - Tech stack and dev conventions
   - Out of scope decisions

3. Interview me only about the gaps, one topic at a time.
   If docs/sources/ had a document that already answered 
   something clearly, skip it and tell me you're skipping it 
   and why.

4. Based on existing docs + my answers, fill in:
   - @docs/spec.md
   - @docs/design/direction.md
   - @docs/brand.md
   - @docs/features/auth-roles.md (if roles exist)
   - @CLAUDE.md

5. Propose the folder structure for the codebase — but do not 
   create any files yet. Wait for my approval.
   Always scaffold frameworks into subfolders (frontend/, 
   backend/, functions/) — never at the project root.

6. Flag anything you think I should reconsider or that seems 
   technically ambiguous before we build.

7. Show a summary of everything defined and ask for 
   confirmation before closing.

The quality of this session determines the quality of 
everything built after it.
```

---

### Step 5 — After Session Zero, commit and clear

```bash
git add .
git commit -m "chore: Session Zero — spec, roles, design direction, CLAUDE.md defined"
git push
```

Then inside Claude Code:
```
/clear
```

This wipes the conversation. Your context is now safely in the files.

### Step 6 — Start your first implementation session

```
/start
```

Claude reads your context files, summarises the current state,
and asks what you want to work on. You never start blind again.

---

## The Daily Workflow Loop

Every session follows this exact loop — no exceptions.

```
/start        → Claude reads context files and confirms project state
              ↓
Plan Mode     → define the task before touching any code (Shift+Tab twice)
              ↓
Normal Mode   → implement against the agreed plan
              ↓
/review       → staff engineer subagent reviews changes, reports issues only
              ↓
/close        → Claude updates progress.md and gives you a commit message
              ↓
git commit    → commit with the suggested message
              ↓
/clear        → wipe the conversation, start fresh next session
```

**The session is disposable. The files are permanent.**

---

## The Four Commands

| Command | When to run | What it does |
|---|---|---|
| `/start` | Beginning of every session | Reads context files, summarises state, asks what to work on |
| `/new-feature` | When adding new scope | Interviews you, updates spec.md first, then plans, then builds |
| `/review` | Before every commit | Spawns read-only staff engineer subagent to review changes |
| `/close` | End of every session | Updates progress.md, suggests commit message, signals ready to /clear |

---

## The Three Skills (automatic — you don't call these)

| Skill | Activates when |
|---|---|
| `session-start` | You say "let's start", "where were we", "continuing from..." |
| `new-feature` | You say "I want to add", "let's build", "new requirement..." |
| `session-close` | You say "wrapping up", "that's it for today", "let's commit..." |

Skills fire automatically based on context. You don't have to remember them.

---

## The Context Files

Claude Code has no memory between sessions. These files are the memory.

| File | Purpose | Updated when |
|---|---|---|
| `CLAUDE.md` | How to work on this project | Rarely — conventions change slowly |
| `docs/spec.md` | What the product is and does | Before implementing any new scope |
| `docs/progress.md` | What has been built, what's next | End of every session via /close |
| `docs/lessons.md` | Mistakes made, rules going forward | When something new is learned |
| `docs/design/direction.md` | Visual language and UI direction | Session Zero, then rarely |
| `docs/features/auth-roles.md` | Roles and permission rules | When auth scope changes |

> Never add large content directly into CLAUDE.md.
> Use @references so Claude loads docs only when relevant,
> not on every single token of every session.

---

## Known Gotchas

**create-next-app and similar scaffolding tools fail at the project root.**
The root is not empty — it contains template files. Always scaffold into
a subfolder: `frontend/`, `backend/`, `functions/`, etc.
Tell Claude explicitly in your prompt or it may try the root by default.

**Do not run /init.** This template already has CLAUDE.md. Running /init
generates a new one and overwrites your template structure.

**Do not fork this repo to start a new project.** Use "Use this template"
instead. Forks share git history; template repos don't.

**Commit .claude/ to git.** Skills, commands, and settings are as valuable
as source code. They should never be gitignored.

---

## Customising for Your Stack

After Session Zero, two things to update manually:

**.claude/settings.json** — replace the placeholder formatter with your real command:
```json
"command": "cd frontend && npx prettier --write $CLAUDE_TOOL_OUTPUT_PATH"
```

**Stack-specific plugins** — install once inside Claude Code:
```bash
claude plugins install firebase   # for Firebase projects
claude plugins install superpowers # TDD, planning, code review skills
```

---

## Philosophy

> The developers getting the most out of Claude Code aren't the best
> prompters — they're the ones who built the best system around it.

Skills activate automatically so you never have to remember workflows.
Docs persist across sessions so Claude is never starting blind.
Hooks enforce quality so nothing slips through.

**Build the scaffold once. Use it forever.**

---