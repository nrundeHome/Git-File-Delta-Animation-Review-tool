#!/usr/bin/env bash
# scripts/pre-commit-verify.sh — PreToolUse hook (Bash matcher)
# Fires before Claude Code runs any Bash command.
# Intercepts git commit and enforces the verify gate.
#
# Input: JSON on stdin with the tool call details.
# Exit 0 = allow the tool call.
# Exit 1 + message on stdout = block the tool call and show message to Claude.

# Read stdin (tool input JSON) — only act on git commit commands
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Only intercept git commit
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

# Check if guard passes
if ! node scripts/guard.js > /dev/null 2>&1; then
  echo "BLOCKED: guard violations found. Run 'npm run guard' to see details, fix before committing."
  exit 1
fi

# Remind about verify if worktrees exist
WORKTREES_DIR=".claude/worktrees"
if [ -d "$WORKTREES_DIR" ] && [ -n "$(ls -A "$WORKTREES_DIR" 2>/dev/null)" ]; then
  echo "REMINDER: Worktrees exist in .claude/worktrees/ — ensure /verify has been run on all loop-writer output before committing."
fi

# Check for bare console.log (quick inline check in addition to guard)
if grep -r "console\.log" src/ --include="*.js" | grep -v "// keep" | grep -q .; then
  echo "BLOCKED: bare console.log found in src/. Use console.warn/error or add // keep."
  exit 1
fi

exit 0
