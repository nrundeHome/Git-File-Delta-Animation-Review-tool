# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

Browser extension (Chrome/GitKraken) that replays a pull request's diff as an animation driven by a time-bar slider. Risk indicator (low→high) colors line changes in real time based on a calculated risk score. The reviewer "feels" where risky changes are before reading a single line of diff.

**Design intent:**
- Slider is the primary interaction — drag left→right to replay the PR in commit order
- Risk coloring is ambient — high-risk lines glow red, low-risk lines green
- "Risky" = lines changed + cyclomatic complexity delta + file type weight (config/auth = high) + author churn history in that file

---

## First-time Setup

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # production build → dist/
```

**Extension load:** Chrome → `chrome://extensions` → Enable Developer mode → Load unpacked → `dist/`
**GitHub token:** Enter in the extension popup (PAT with `repo` scope). Never commit tokens.
**Test account:** GitHub Personal Access Token with `repo` scope for integration tests

**Quick re-auth (if token expires — browser console):**
```javascript
chrome.storage.local.set({ github_token: 'YOUR_TOKEN' }, () => location.reload())
```

---

## Working Style

- Proceed autonomously with setup, dependency installation, and exploratory commands. Do not defer to the user unless explicitly blocked.
- Use actual codebase data and real file references — never hypothetical examples.
- After any implementation, test in Chrome with the extension loaded from `dist/`. Report: "Tested in Chrome extension, console shows X, DOM shows Y."

---

## Configured Hooks (auto-run)

| Hook | Trigger | What it does |
|------|---------|--------------|
| SessionStart | Start of every session | `scripts/session-start.sh` — injects `/triage` instructions |
| PreToolUse | `git commit` | `scripts/pre-commit-verify.sh` — reminds to run `/verify` before commit |
| PostToolUse | Write/Edit on `src/**` | `scripts/post-write-guard.sh` — scans for hardcoded tokens, animation without FPS logging |

**`.claude/settings.local.json`:**
```json
{
  "hooks": {
    "SessionStart": { "run": "bash scripts/session-start.sh" },
    "PreCommit":    { "run": "bash scripts/pre-commit-verify.sh" },
    "PostWrite":    { "run": "bash scripts/post-write-guard.sh", "glob": "src/**" }
  }
}
```

---

## Commands

### Dev

```bash
npm run dev             # Vite dev server + hot reload
npm run mock-api        # GitHub API mock server (required for integration tests)
npm run build           # production build → dist/
npm run build:watch     # incremental build (use when testing extension in Chrome)
```

### Tests

**Which runner to use:**
- User drags slider → sees animation → `tests/behavior/` (Playwright)
- API contract (GitHub diff endpoint → response shape) → `tests/integration/`
- Pure logic (risk score, sort key, color mapping) → `tests/unit/`

```bash
npm run test                    # all tests (Vitest)
npm run test:unit               # pure logic — fastest
npm run test:integration        # GitHub API contract tests
npm run test:behavior           # browser automation (Playwright)
npm run test:watch              # watch mode during development
npm run test:coverage           # full suite + coverage report
npm run test:failures           # re-run only previously-failed tests
```

⚠ **Never run behavior tests against live GitHub API** — use `npm run mock-api`.

**Note:** Vitest runs with `globals: false`. Test files must explicitly import `describe`, `test`, `expect`, etc. from `'vitest'`.

### Operational

```bash
npm run guard           # scan for anti-patterns (read-only)
npm run guard:fix       # auto-fix safe violations only
npm run agents:cleanup  # remove stale agent worktrees (> 48h, completed)
npm run loop:archive    # prune loop state files (keep 7 most recent per loop name)
npm run health          # check that dev server + mock API are up
```

---

## Architecture

```
src/
├── manifest.json           # Manifest V3 entry points + permissions
├── background.js           # service worker: GitHub API calls, caching, license validation
├── content.js              # injected into GitHub PR pages — mounts overlay + risk pills
├── popup/
│   ├── popup.html
│   └── popup.js
├── diffcast/
│   └── app.js              # ~1400-line monolith: Shadow DOM UI, slider, animation, state
├── services/
│   ├── githubApi.js        # wrapper: auth + retry + rate limiting + chrome.storage cache
│   └── diffParser.js       # GitHub diff → DiffLine[] + dangerous window detection
├── utils/
│   ├── riskCalculator.js   # pure fn: metrics → risk score (0–100)
│   └── animationEngine.js  # requestAnimationFrame loop + FPS logging
├── config/
│   └── api.js              # GITHUB_API_VERSION, risk thresholds, file weights, cache TTLs
└── styles/
    ├── animation.css
    ├── risk-colors.css      # WCAG AA verified palette (light + dark surface variants)
    └── variables.css        # design tokens (z-index, timing, breakpoints)

tests/
├── behavior/               # Playwright: user drags slider, sees animation
├── integration/            # GitHub API mock: diff fetched, parsed, rendered
├── unit/                   # Pure logic: riskCalculator, diffParser, sort keys
└── helpers/
    ├── mockGithubApi.js
    └── testFixtures.js     # known PR diffs for deterministic tests

memory/                     # loop state files (not committed)
agent-os/                   # standards + analysis (committed)
skills/                     # Claude Code skill files
docs/
```

**Key domain terms** (full glossary in `docs/CONTEXT.md`):
- **Diff Frame** — snapshot of a file at one commit in the PR history
- **Timeline** — ordered sequence of commits; slider position maps here
- **Risk Score** — 0–100 value per frame (size, churn, file type, author history)
- **Chunk** — contiguous block of added/removed/unchanged lines within a Diff Frame
- **Risk Threshold** — 0–33 low (green), 34–66 medium (yellow), 67–100 high (red)
- **Animation Tick** — one `requestAnimationFrame` callback, renders one Diff Frame

---

## Critical Code Patterns

**Animation frames — always log FPS:**
```javascript
let lastFrame = 0
requestAnimationFrame(function tick(timestamp) {
  const elapsed = timestamp - lastFrame
  if (elapsed < 16.7) { /* skip if < 60fps threshold */ }
  if (elapsed > 50) console.warn(`[animation] jank: ${elapsed.toFixed(1)}ms frame`)
  lastFrame = timestamp
  // render logic
  requestAnimationFrame(tick)
})
```

**Risk colors — WCAG AA (4.5:1 contrast) required:**
```css
/* Light surface (GitHub PR list pages) — defined in styles/risk-colors.css */
:root {
  --risk-lo: #1a7f37;   /* 5.2:1 on white */
  --risk-md: #9a6700;   /* 4.6:1 on white */
  --risk-hi: #cf222e;   /* 5.1:1 on white */
}
/* Dark surface (Shadow DOM) uses --risk-lo-d / --risk-md-d / --risk-hi-d variants */
```

**GitHub API — wrapper only, never bare fetch:**
```javascript
const pr = await githubApi().path(`/repos/${owner}/${repo}/pulls/${prNumber}`).get()
if (!pr.ok) { console.error('GitHub API error:', pr.status, pr.statusText); return }
const data = await pr.json()
```

**API response shape — check before destructuring:**
```javascript
const data = await githubApi().path('/...').get().then(r => r.json())
if (data.status !== 'ok') { console.error('unexpected response:', data); return }
```

**Listener cleanup — always remove in destroy() (Phase 2 TODO in app.js):**
```javascript
class TimeSlider {
  init() {
    this._onSlide = this._handleSlide.bind(this)
    this._el.addEventListener('input', this._onSlide)
  }
  destroy() {
    this._el.removeEventListener('input', this._onSlide)  // REQUIRED
  }
}
```

**Animation respects prefers-reduced-motion:**
```javascript
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (prefersReduced) {
  renderFrame(timeline.length - 1)
  return
}
startAnimation()
```

---

## Debugging Protocol

0. Check `agent-os/analysis/RECURRING-PATTERNS.md` first — known bugs have detection commands
1. Add `console.log` to ALL suspected handlers before guessing a cause
2. Test in **Chrome extension context** (not just Vite dev server) — extension CSP differs
3. Try Incognito window — extension state may be cached from previous load
4. Perform action, see which log fires → modify ONLY that file
5. Report: "Tested in Chrome extension (Incognito), console shows X, DOM shows Y"

**Never:** "Should work" — **Always:** evidence

| Issue | Wrong assumption | Right diagnosis |
|-------|-----------------|-----------------|
| CSS not applying | Edit CSS file | Check CSP blocks inline styles; check shadow DOM isolation |
| API call fails silently | Network error | Check `chrome.runtime.lastError` in background.js |
| Slider stutters | Logic error | Check `requestAnimationFrame` frame time log — PERF-001 |
| Risk color not visible | Color value wrong | Check WCAG contrast — RISK-001 (4.5:1 minimum) |
| Works in dev, breaks after build | Build config | Check Vite manifest.json + content script injection |
| `prefers-reduced-motion` ignored | Accessibility oversight | Check animationEngine.js respects the media query |

---

## Planning Session Format

State three things upfront:
1. **The goal** (not motivation) — "Build X" not "X is a problem"
2. **What it's NOT** — explicit exclusion prevents building the wrong thing
3. **Where to stop** — "commit the plan, I'll decide next steps" is the default gate

> "[goal]. Not [excluded scope]. Output: [artifact]. Commit. I'll decide whether to implement."

---

## Non-negotiable Test Rules

- **Run tests before committing.** If new code breaks existing tests, fix before proceeding.

- **RULE-01 (Proxy mocks):** Use proxy wrappers for domain objects with arity enforcement — plain object mocks return `undefined` where the real object returns a function.

- **RULE-02 (Unconditional teardown):** Browser/page teardown in `afterAll` MUST be unconditional. Feature guards go inside `test()` bodies, not `afterAll`.
  ```javascript
  afterAll(async () => {
    await browser?.close()   // UNCONDITIONAL — no if-checks here
  })
  ```

- **RULE-03 (Setup probes):** Every test setup must verify application-observable behavior — not just that data exists in the store.

- **RULE-04 (Selectors):** Use `data-testid` over class selectors. When using classList assertions, add a comment citing the source file where the class is assigned, plus a negative assertion.

- **RULE-05 (Auth error paths):** Every auth test must assert: (1) URL did not change, (2) inline error element visible with non-empty text, (3) raw JSON not rendered in page body.

- **RULE-06 (Multi-notation predicates):** If a condition can be satisfied by multiple data formats, test EVERY format.

- **RULE-07 (Sort key boundaries):** Multi-component sort keys must include a cross-boundary assertion: `key(N+1, 0) > key(N, MAX)`.

**Set explicit per-test timeouts** — default 2000ms is too low for browser automation:
```javascript
test('slider animates to 50%', async () => { ... }, 15000)
```

---

## Git & Commits

PRs target `main`. Max 72-char subject line.
Conventional Commits: `type(scope): subject`
Examples: `fix(animation): prevent jank on 5000+ line diffs`, `feat(risk): add WCAG-verified color transitions`

Pre-commit blocks: bare `console.log` (allows `console.error`, `console.warn`, `// keep`), hardcoded GitHub API versions, hardcoded color values outside `risk-colors.css`.

Loop worktree commits (`[loop]` prefix) require human review before merging.

---

## Agent Skills

**Mandatory — run every time for the given trigger:**

| Skill | Trigger |
|-------|---------|
| `/triage` | Start of any session |
| `/guard` | Before writing any code |
| `/verify` | After any loop-writer agent completes |
| `/quality-gate` | Before marking any phase complete or creating a PR |

| Need | Skill |
|------|-------|
| Write a test, unsure which runner | `/write-test` |
| Architectural decision | `/adr` |
| Bug took > 1 hour to diagnose | `/post-mortem` |
| New UI component | `/frontend-design` |

---

## Loop/Agent Workflow

Writer and verifier are **always separate processes**.

### Phase 1: Triage (read-only)
Run `/triage` at session start. Writes `memory/loop-state-triage-YYYY-MM-DD.md`.

### Phase 2: Loop Writer (isolated worktree)
```
Worktree: .claude/worktrees/agent-{slug}-{YYYY-MM-DD}
Branch: agent-{slug}-{YYYY-MM-DD}
Commits tagged: [loop]
```
Writer **exits** before running any tests.

### Phase 3: Loop Verify (independent verifier)
Receives only: worktree path. Runs `npm run test` + `npm run guard`. Returns PASS/FAIL.
Writes `memory/loop-state-verify-{slug}-YYYY-MM-DD.md`.

- **PASS** → human reviews diff, marks "## Reviewed" in state file
- **FAIL** → new writer agent with verifier's verdict as input (never re-prompt original writer)
- **Max 3 cycles** → escalate to human

### Human Review Checklist (before merging any `[loop]` commit)
- [ ] Diff reviewed — logic is sound
- [ ] Tests pass (verifier ran them)
- [ ] Guard clean
- [ ] No hardcoded configuration
- [ ] Listener cleanup in `destroy()` present
- [ ] No `console.log` left behind
- [ ] `prefers-reduced-motion` handled (if animation)

---

## Key References

| What | Where |
|------|-------|
| Mandatory coding patterns | `agent-os/standards/global/mandatory-patterns.md` |
| Anti-pattern registry | `agent-os/analysis/RECURRING-PATTERNS.md` |
| Loop operations standard | `agent-os/standards/global/loop-operations.md` |
| Verification split standard | `agent-os/standards/global/verification-split.md` |
| Worktree standard | `agent-os/standards/global/worktree-standard.md` |
| Memory handoff standard | `agent-os/standards/global/loop-memory.md` |
| Test writing rules | `agent-os/standards/testing/test-writing.md` |
| Domain glossary | `docs/CONTEXT.md` |
| Skill catalog | `agent-os/product/skills.md` |
