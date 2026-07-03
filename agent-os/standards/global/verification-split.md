# Verification Split Standard

Writer and verifier are ALWAYS separate processes.

## Rules

1. Writer exits BEFORE running tests
2. Verifier receives ONLY the worktree path — no shared context with writer
3. Verifier runs full test suite + guard and returns PASS/FAIL verdict ONLY (no suggestions)
4. If FAIL: spawn NEW writer with verifier's verdict as input. Never re-prompt original writer.
5. Max 3 cycles before escalating to human

## Why

Self-review bias: a writer that also verifies interprets failures charitably. An independent
verifier cannot rationalize its way to PASS — it either passes or fails.
