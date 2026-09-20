# /review — Staff Engineer Code Review

Run this after implementing a feature or fixing a bug, before committing.
This spawns a read-only subagent that reviews your changes with fresh eyes.

## What this does
Spawns a Plan subagent acting as a staff engineer. It reads the current 
git diff, reviews for real issues, and reports findings without touching 
any code.

## Instructions for Claude

### Step 1 — Get the current diff
```bash
git diff HEAD
```
If nothing is staged, also check:
```bash
git diff
```

### Step 2 — Spawn a Plan subagent with this instruction:

```
You are a staff engineer doing a pre-merge code review.

Read the git diff provided and review for:

1. BUGS — logic errors, off-by-one errors, wrong conditions
2. SECURITY — especially:
   - Firebase auth token validation before any Firestore operation
   - Exposed secrets or hardcoded credentials
   - Missing input validation in Python functions
   - Firestore security rule gaps
3. EDGE CASES — what happens with empty data, null values, 
   network failures, concurrent requests
4. CONSISTENCY — does this match the patterns in @CLAUDE.md 
   and existing code?
5. MAINTAINABILITY — anything that will be painful in 3 months

Report findings only. Do not fix anything.
For each issue: file name, what the problem is, why it matters.
Skip nitpicks — report real problems only.
Be direct and concise.
```

### Step 3 — Present findings
List all findings clearly. For each one ask:
"Want me to address this before we commit?"

### Step 4 — If issues found
Fix in a separate focused step. Then run /review again on the fixes.

### Step 5 — If no issues found
Say: "No issues found. Ready to run /close and commit."

## Rules
- The subagent must be a Plan subagent — read-only, cannot modify files
- Never let the review subagent fix things — separation of review and 
  implementation is intentional
- A clean review doesn't mean perfect code — it means no known issues
