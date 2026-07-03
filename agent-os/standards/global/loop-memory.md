# Loop Memory Handoff Standard

State files are the only communication channel between loop phases. Agents do not share context directly.

---

## File Locations

```
memory/loop-state-triage-{YYYY-MM-DD}.md          # triage phase output
memory/loop-state-verify-{slug}-{YYYY-MM-DD}.md   # verifier phase output
memory/_archive/                                    # pruned files (keep 7 most recent per loop name)
```

These files are **not committed** — add `memory/` to `.gitignore` (except `memory/_archive/` if you want audit trail).

---

## What Each Phase Writes

### Triage writes:
- Prioritized work queue (failing tests, guard violations, stale worktrees)
- Current branch/worktree state
- Recommended next action

### Verifier writes:
- Worktree path tested
- Test suite result: PASS / FAIL
- Guard result: PASS / FAIL
- If FAIL: exact failures, no interpretation, no suggestions

### Human writes (in the verify state file):
```
## Reviewed
- [x] {commit hash}: reviewed by {name} on YYYY-MM-DD
```

---

## Handoff Rules

1. **Triage → Writer:** writer reads the triage state file; receives no other context
2. **Writer → Verifier:** verifier receives only the worktree path; reads no writer context
3. **Verifier → Writer (on FAIL):** new writer receives only the verifier state file; never the original writer's context
4. No agent summarizes for the next agent — state files are the full record

---

## Retention

`npm run loop:archive` keeps the 7 most recent state files per loop name and moves older ones to `memory/_archive/`. Run after each completed loop cycle.
