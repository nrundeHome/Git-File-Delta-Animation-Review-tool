# /triage

**When:** Start of every session — mandatory before any other work.  
**Output:** `memory/loop-state-triage-{YYYY-MM-DD}.md`

---

## What to do

Run these checks in order. Record every finding in the state file — do not fix anything during triage.

### 1. Unit + integration tests

```bash
npm run test:unit
npm run test:integration
```

Record: pass count, fail count, any error messages. If tests fail, note the file and test name.

### 2. Guard scan

```bash
npm run guard
```

Record: each violation with its ID (ANIM-001, API-001, etc.), file, and line number.

### 3. Stale worktrees

List `.claude/worktrees/`. For each directory:
- Note its name and age (mtime)
- Flag any older than 48 hours
- Check if it has uncommitted changes (`git status --porcelain` in that dir)

### 4. Unreviewed [loop] commits

```bash
git log --format="%H %s" | grep "\[loop\]"
```

For each [loop] commit hash, search `memory/` for a `[x]` reviewed entry. Flag any without one.

### 5. Open TODOs in source

```bash
grep -rn "TODO\|FIXME\|HACK\|Phase [2-9]" src/ --include="*.js"
```

List the top 5 by frequency.

---

## State file format

Write to `memory/loop-state-triage-{YYYY-MM-DD}.md`:

```markdown
---
loop: triage
date: YYYY-MM-DD
status: complete | blocked
---

## Discovered
- [ ] {failing test or violation}
- [x] {item that is clean}

## Test Status
- Unit: {N} passing, {N} failing
- Integration: {N} passing, {N} failing
- Behavior: {N} passing, {N} failing (or: not yet written)

## Guard Violations
- {ID} {file}:{line} — {message}
(or: none)

## Stale Worktrees
- {name} ({age}h) — {clean|dirty}
(or: none)

## Unreviewed [loop] Commits
- {short hash}: {subject}
(or: none)

## Pending Human Review
- {anything that requires a decision}

## Next Steps
- {prioritized list of what to work on this session}
```

---

## Rules

- Triage is **read-only** — do not fix violations during this phase
- If tests fail, note it but do not investigate root cause yet
- If guard has critical violations, flag them in "Pending Human Review"
- Write the state file even if everything is clean (it's the record)
