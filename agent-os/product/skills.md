# DiffCast Skill Catalog

Skills are Claude Code slash commands defined in `skills/`. Each has a `SKILL.md` that Claude reads when the skill is invoked.

---

## Mandatory skills (run every time for the given trigger)

| Skill | When to run | What it does |
|---|---|---|
| `/triage` | Start of every session | Scans for failing tests, guard violations, stale worktrees, unreviewed [loop] commits. Writes `memory/loop-state-triage-{date}.md`. |
| `/guard` | Before writing any code | Reads `RECURRING-PATTERNS.md`, scans `src/` for known anti-patterns. Advisory — does not modify files. |
| `/verify` | After any loop-writer agent completes | Receives worktree path only. Runs `npm test` + `npm run guard`. Returns PASS/FAIL. No suggestions. |
| `/quality-gate` | Before marking any phase complete or opening a PR | Runs full test suite, guard, checks [loop] commit review status in memory/ files. |

---

## On-demand skills

| Skill | When to use |
|---|---|
| `/write-test` | Writing a new test and unsure which runner (behavior/integration/unit) |
| `/adr` | Making an architectural decision that will be hard to reverse |
| `/post-mortem` | A bug took more than 1 hour to diagnose |
| `/frontend-design` | Building a new UI component or experiment |

---

## Skill file locations

```
skills/
├── triage/SKILL.md
├── verify/SKILL.md
├── guard/SKILL.md
├── quality-gate/SKILL.md
└── write-test/SKILL.md
```

---

## Skill stubs to author next

The following skills are referenced in CLAUDE.md but not yet written. Author them when the project reaches the corresponding phase.

| Skill | Phase |
|---|---|
| `/write-test` | Phase 1 (first tests written) |
| `/adr` | Phase 1 (first architectural decision needed) |
| `/post-mortem` | Phase 2 (after first production bug) |
| `/guard` | Phase 1 (once `src/` exists and RECURRING-PATTERNS.md is meaningful) |
