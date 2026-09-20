---
name: new-feature
description: >
  Activate when the user mentions adding a new feature, new scope, 
  new functionality, "I want to build", "I want to add", "what if we had",
  "let's add", "new requirement", "I was thinking about adding", or any 
  phrase that signals expanding the product beyond what already exists 
  in spec.md. Also activates when the user explicitly mentions updating 
  the spec or product definition.
---

# New Feature / New Scope Workflow

## Purpose
Ensure every new feature is fully defined, reviewed, and agreed upon 
in spec.md BEFORE any code is written. This prevents Claude from making 
assumptions during implementation, avoids conflicts with existing features, 
and creates a clear target that implementation can be measured against.

## The Core Rule
**Spec first. Code second. Always.**

The spec is the contract. The code is the implementation of the contract.
Never invert this order.

## Steps to Execute Automatically

### 1. Enter Plan Mode immediately
Tell the user: "Entering Plan Mode to define this feature before we touch any code."
Do not write any implementation code until Step 5.

### 2. Read current spec and related docs
```
@docs/spec.md
@docs/features/          — if the directory exists, scan relevant feature files
@CLAUDE.md               — check for constraints relevant to this feature
```

### 3. Interview the user
Ask the questions they haven't thought of yet. Cover:
- **Scope:** What exactly does this feature do? Where does it start and stop?
- **Roles:** Which user roles interact with this? What can each role do?
- **Data:** What new data does this create, read, update, or delete?
- **Edge cases:** What happens when it fails? What are the empty states?
- **Conflicts:** Does this touch anything already built? Could it break anything?
- **Out of scope:** What are we explicitly NOT building in this iteration?

Do not ask all questions at once. Have a real conversation.
Stop when the feature is unambiguously defined.

### 4. Update spec.md (still in Plan Mode)
Write the new feature definition into the appropriate place in spec.md.
If a dedicated feature file is warranted (complex features), 
create docs/features/[feature-name].md and reference it from spec.md.

After writing, show the user exactly what changed and ask:
"Does this match your intent before we proceed?"

### 5. Run staff engineer review
Spawn a Plan subagent with this instruction:
```
You are a staff engineer reviewing a new feature spec before implementation.
Read @docs/spec.md and the changes just made.
Look for:
- Conflicts with existing features or architecture
- Missing edge cases that will cause bugs
- Role/permission gaps
- Data model issues
- Anything that will be painful or expensive to change later
Report findings only. Do not suggest implementation approaches.
Be direct and specific.
```

Surface the findings to the user. Discuss and resolve before proceeding.

### 6. Only now — switch to Normal Mode and build
The spec is agreed. The review is done. Now implement against the spec,
not against assumptions.

Reference the spec explicitly during implementation:
"Implementing against the definition in @docs/spec.md — [feature name]"

## Rules
- Never skip the interview phase, even for "small" features
- Never update spec.md after implementation as a retroactive documentation step
- If the user insists on coding first, explain the risk once, then respect their choice
  but note it in lessons.md as a known shortcut taken
- Spec changes that affect roles must also update @docs/features/auth-roles.md

## Gotchas
- Users often describe the solution, not the problem — ask "what problem does this solve?"
- "Small features" that touch auth, roles, or the data model are never small
- If a feature requires more than one Firestore collection, it probably needs its own feature file
