# /verify

**When:** After any loop-writer agent completes.  
**Input:** Worktree path only — no other context from the writer.  
**Output:** PASS or FAIL verdict + `memory/loop-state-verify-{slug}-{YYYY-MM-DD}.md`

---

## Rules (non-negotiable)

1. You are the **verifier** — you have no knowledge of what the writer intended
2. Run tests and guard. Report results. **No suggestions. No fixes. No interpretations.**
3. PASS means: all tests pass AND guard exits 0
4. FAIL means: any test fails OR guard exits 1
5. If FAIL: write the verdict file with the exact error output, then stop

---

## What to do

Receive the worktree path. Run:

```bash
# From the worktree directory:
npm run test
npm run guard
```

Capture all output verbatim.

---

## Verdict file format

Write to `memory/loop-state-verify-{slug}-{YYYY-MM-DD}.md`:

```markdown
---
loop: verify
slug: {slug}
date: YYYY-MM-DD
status: pass | fail
---

## Verdict: PASS | FAIL

## Test Output
```
{full npm run test output}
```

## Guard Output
```
{full npm run guard output}
```

## Failing Items
- {test name}: {error message}
- {guard ID} {file}:{line}: {violation}
(omit this section if PASS)
```

---

## After writing the verdict file

- **PASS** → notify human to review diff and mark `## Reviewed` in state file before merging
- **FAIL** → stop. Human or orchestrator will spawn a new writer with this verdict as input

Do not re-run, do not suggest fixes, do not modify any source files.
