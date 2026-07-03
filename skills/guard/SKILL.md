# /guard

**When:** Before writing any code.  
**Mode:** Advisory — read-only, never modifies files.  
**Output:** Printed report only (no file written).

---

## What to do

```bash
npm run guard
```

Read the output. For each violation, report:
- Pattern ID (e.g., `API-001`)
- Severity (critical / high / medium)
- File and line number
- What the violation is

Then read `agent-os/analysis/RECURRING-PATTERNS.md` and check for any patterns not covered by the automated scan (e.g., PERF-001, CACHE-001) that require manual inspection.

---

## Pattern reference

| ID | Severity | What to look for manually |
|----|----------|--------------------------|
| ANIM-001 | High | `requestAnimationFrame` without `console.warn` jank logging |
| WCAG-001 | Critical | `requestAnimationFrame` without `prefers-reduced-motion` guard |
| API-001 | High | Hardcoded `'2022-11-28'` or bare `fetch('https://api.github.com...')` |
| LOG-001 | High | `console.log` without `// keep` in `src/` |
| RISK-001 | Critical | Risk hex colors (`#cf222e`, `#9a6700`, `#1a7f37`) hardcoded in JS |
| CODE-001 | High | `classList.contains` in tests without `data-testid` |
| PERF-001 | High | Slider `input` event → `querySelectorAll('.diff-line')` on every tick |
| CACHE-001 | Medium | CSS change not reflected after build (manual: reload extension in Incognito) |
| TEST-001 | Medium | Test fixture diff > 50 lines |
| LOOP-001 | High | `[loop]` commits in git log without reviewed entry in `memory/` |

---

## After the scan

If violations found:
- List them clearly
- Do NOT fix them yet — that is the job of the implementing step
- Ask whether to proceed anyway or fix first

If clean:
- State: "Guard clean — no violations found. Proceeding with implementation."
