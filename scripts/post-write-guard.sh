#!/usr/bin/env bash
# scripts/post-write-guard.sh — PostToolUse hook (Write|Edit matcher, glob: src/**)
# Fires after Claude Code writes or edits a file in src/.
# Runs targeted checks on the modified file only.
#
# Input: JSON on stdin with the tool result (includes file_path).
# Stdout is shown to Claude as a hook message.
# Exit 0 always — this hook is advisory, not blocking (use guard for blocking).

INPUT=$(cat)

# Extract file path from tool result JSON
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
  | sed 's/"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Fall back: if no file_path, extract from new_string context
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only scan JS files in src/
if [[ "$FILE_PATH" != src/*.js ]] && [[ "$FILE_PATH" != src/**/*.js ]]; then
  exit 0
fi

WARNINGS=()

# Check: hardcoded GitHub API version
if grep -q "2022-11-28\|2022-11\|X-GitHub-Api-Version.*['\"][0-9]" "$FILE_PATH" 2>/dev/null; then
  if [[ "$FILE_PATH" != *"config/api.js"* ]]; then
    WARNINGS+=("[post-write] API-001: hardcoded GitHub API version in $FILE_PATH — import from src/config/api.js")
  fi
fi

# Check: bare fetch() to GitHub API
if grep -q "fetch.*api\.github\.com" "$FILE_PATH" 2>/dev/null; then
  if [[ "$FILE_PATH" != *"githubApi.js"* ]]; then
    WARNINGS+=("[post-write] API-001: bare fetch() to api.github.com in $FILE_PATH — use githubApi() wrapper")
  fi
fi

# Check: requestAnimationFrame without console.warn
if grep -q "requestAnimationFrame" "$FILE_PATH" 2>/dev/null; then
  if ! grep -q "console\.warn" "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("[post-write] ANIM-001: requestAnimationFrame without FPS logging in $FILE_PATH")
  fi
  if ! grep -q "prefers-reduced-motion" "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("[post-write] WCAG-001: requestAnimationFrame without prefers-reduced-motion check in $FILE_PATH")
  fi
fi

# Check: bare console.log
if grep -q "console\.log" "$FILE_PATH" 2>/dev/null; then
  if ! grep "console\.log" "$FILE_PATH" | grep -q "// keep"; then
    WARNINGS+=("[post-write] LOG-001: bare console.log in $FILE_PATH — use console.warn/error or add // keep")
  fi
fi

# Check: hardcoded risk color hex values
RISK_COLORS="#cf222e\|#9a6700\|#1a7f37\|#f85149\|#d4a017\|#3fb950"
if grep -qi "$RISK_COLORS" "$FILE_PATH" 2>/dev/null; then
  WARNINGS+=("[post-write] RISK-001: hardcoded risk color hex in $FILE_PATH — use CSS variables from risk-colors.css")
fi

# Report
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  echo "⚠ post-write guard warnings for $FILE_PATH:"
  for w in "${WARNINGS[@]}"; do
    echo "  $w"
  done
  echo "  Run 'npm run guard' for full scan."
  echo ""
fi

exit 0
