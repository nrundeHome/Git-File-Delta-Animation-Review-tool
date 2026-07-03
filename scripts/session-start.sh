#!/usr/bin/env bash
# scripts/session-start.sh — SessionStart hook
# Fires at the start of every Claude Code session.
# Injects /triage reminder and project context into the session.

cat << 'TRIAGE_PROMPT'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DiffCast Session Start
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MANDATORY: Run /triage before any other work this session.

/triage checks:
  1. Failing tests (npm run test:unit, npm run test:integration)
  2. Guard violations (npm run guard)
  3. Stale worktrees in .claude/worktrees/
  4. Unreviewed [loop] commits in git log
  5. Writes memory/loop-state-triage-YYYY-MM-DD.md

Quick reference:
  npm run dev            Vite dev server → localhost:5173
  npm run mock-api       GitHub API mock → localhost:3001
  npm run build:watch    Incremental build (for Chrome extension testing)
  npm run guard          Scan for anti-patterns (read-only)
  npm run test           All unit + integration tests

Standards:
  agent-os/standards/global/mandatory-patterns.md
  agent-os/analysis/RECURRING-PATTERNS.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRIAGE_PROMPT
