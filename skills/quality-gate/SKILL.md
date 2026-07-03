# /quality-gate

**When:** Before marking any phase complete or opening a PR.  
**Output:** PASS or FAIL with blocking items listed. No partial passes.

---

## Checklist (all must pass)

### 1. Full test suite

```bash
npm run test
```

All unit, integration, and behavior tests must pass.  
Zero failures. Zero skipped tests that weren't intentionally skipped.

### 2. Guard scan

```bash
npm run guard
```

Zero blocking violations (critical or high).  
Warnings (medium/low) are acceptable but must be noted.

### 3. [loop] commit review status

```bash
git log --format="%H %s" | grep "\[loop\]"
```

For each [loop] commit: confirm a `[x] {hash}: reviewed` entry exists in `memory/`.  
Any unreviewed [loop] commits = FAIL.

### 4. Human review checklist (for each changed file)

- [ ] No `console.log` in `src/` (without `// keep`)
- [ ] No hardcoded GitHub API version strings
- [ ] No bare `fetch()` to `api.github.com`
- [ ] Listener cleanup present in any component with `addEventListener`
- [ ] `prefers-reduced-motion` handled in any new animation entry point
- [ ] All new risk colors added to `src/styles/risk-colors.css` (not hardcoded in JS)
- [ ] New behavior tests use `data-testid` selectors (not classList)
- [ ] New behavior tests have explicit timeouts ≥ 5000ms

### 5. Build check

```bash
npm run build
```

Must complete without errors. Check `dist/` was created.

---

## Output format

```
QUALITY GATE: PASS | FAIL

Tests:   {N} passing, {N} failing
Guard:   {N} violations | clean
[loop]:  {N} reviewed, {N} unreviewed
Build:   success | failed

Blocking items:
- {item}  (omit if PASS)

Warnings (non-blocking):
- {item}
```

---

## If FAIL

List every blocking item. Do not open a PR or mark the phase complete.  
Return to the writer with the blocking list.
