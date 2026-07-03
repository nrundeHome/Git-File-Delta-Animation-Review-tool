# Worktree Standard

All autonomous loop work runs in an isolated git worktree. Never write loop output directly to the main working tree.

---

## Naming Convention

```
Worktree path:  .claude/worktrees/agent-{slug}-{YYYY-MM-DD}
Branch name:    agent-{slug}-{YYYY-MM-DD}
```

`{slug}` is a short kebab-case description of the task (e.g., `time-slider`, `risk-colors`).

---

## Lifecycle

1. **Create** — writer agent creates the worktree before making any changes
2. **Write** — all edits happen inside the worktree; commits are tagged `[loop]`
3. **Exit** — writer exits without running tests
4. **Verify** — independent verifier agent receives only the worktree path
5. **Merge or discard** — human reviews diff; merges to `main` or discards worktree
6. **Cleanup** — `npm run agents:cleanup` removes worktrees older than 48h with status `complete`

---

## Rules

- Writer never touches `main` working tree files
- Verifier receives **only** the worktree path — no shared writer context
- `[loop]` commits require human review before merging (see CLAUDE.md human review checklist)
- Max 3 writer→verifier cycles before escalating to human
- Stale worktrees (> 48h, `complete` status) are removed by `npm run agents:cleanup`

---

## Creating a Worktree

```bash
git worktree add .claude/worktrees/agent-{slug}-{YYYY-MM-DD} -b agent-{slug}-{YYYY-MM-DD}
```

## Removing a Worktree

```bash
git worktree remove .claude/worktrees/agent-{slug}-{YYYY-MM-DD}
git branch -d agent-{slug}-{YYYY-MM-DD}
```
