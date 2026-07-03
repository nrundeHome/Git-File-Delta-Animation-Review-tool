# Recurring Patterns Registry

| Pattern ID | Severity | Description | Detection |
|---|---|---|---|
| ANIM-001 | High | Animation without FPS logging | `grep -r "requestAnimationFrame" src/` without `console.warn` near |
| RISK-001 | Critical | Risk color without WCAG AA contrast check | CSS audit against 4.5:1 threshold |
| CODE-001 | High | Hardcoded DOM selectors in tests | `grep -r "classList.contains" tests/` without `data-testid` |
| PERF-001 | High | Slider event causes full diff re-render | Profile: slider input → DOM mutations count |
| CACHE-001 | Medium | Extension CSS cached after update | Reload extension after build; test in Incognito |
| API-001 | High | GitHub API version hardcoded | `grep -r "api.github.com/v" src/` |
| TEST-001 | Medium | Tests timeout on large diffs | Check test fixtures — use 50-line diffs, not real PRs |
| WCAG-001 | Critical | Animation ignores prefers-reduced-motion | `grep -r "requestAnimationFrame"` without `prefers-reduced-motion` check |
| LOOP-001 | High | [loop] commit merged without human review | `git log --format="%H %s" \| grep "\[loop\]"` cross-ref memory/ Reviewed entries |
