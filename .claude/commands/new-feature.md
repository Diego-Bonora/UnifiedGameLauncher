# /new-feature — Define and Build New Scope

Run this any time you want to add something that doesn't exist yet in spec.md.
This command enforces the spec-first workflow so Claude never implements
against assumptions.

## What this does
Enters Plan Mode, interviews you to fully define the feature, updates 
spec.md, runs a staff engineer review, and only then moves to implementation.

## Instructions for Claude

### Phase 1 — Enter Plan Mode
Announce: "Switching to Plan Mode. We define before we build."
Do not write any implementation code until Phase 4.

### Phase 2 — Read current context
Read:
- @docs/spec.md
- @CLAUDE.md
- @docs/features/ (if it exists — scan for related feature files)

### Phase 3 — Interview the user
Ask focused questions to eliminate ambiguity. Cover:
- What exactly does this feature do?
- Which user roles interact with it and how?
- What data does it create, read, update, or delete?
- What happens when it fails or hits an edge case?
- What are we explicitly NOT building in this iteration?
- Does this affect anything already built?

Have a real conversation — not a form. Stop when the feature 
is unambiguously defined.

### Phase 4 — Update spec.md
Write the new feature into the correct section of @docs/spec.md.
For complex features, create @docs/features/[feature-name].md 
and reference it from spec.md.

Show the user exactly what changed. Ask:
"Does this match your intent? Confirm before we proceed."

### Phase 5 — Staff engineer spec review
Spawn a Plan subagent with this instruction:
```
You are a staff engineer reviewing a new feature spec before implementation.
Read @docs/spec.md and the new feature just added.
Look for: conflicts with existing features, missing edge cases, 
role/permission gaps, data model issues, anything expensive to change later.
Report findings only. Be direct and specific.
```
Surface all findings. Resolve before proceeding.

### Phase 6 — Switch to Normal Mode and implement
The spec is agreed and reviewed. Now implement against it.
Reference @docs/spec.md explicitly during implementation.

## Rules
- Spec update happens BEFORE implementation, always
- If the user wants to skip the spec step, note the risk once,
  respect their choice, and log the shortcut in lessons.md
- Features touching auth or roles must also update 
  @docs/features/auth-roles.md
