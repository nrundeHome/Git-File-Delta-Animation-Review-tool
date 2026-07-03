# CLAUDE.md — New Project Bootstrap
# Animated Code Review Extension (GitHub / GitKraken)

> **What this file is:** Drop this into the root of a new project as `CLAUDE.md`. It encodes every agent workflow, testing rule, and anti-pattern registry convention learned from the Bridge monorepo — stripped of Bridge-specific domain concepts and rewritten for a standalone browser extension.
>
> **What this is NOT:** A tutorial. Read it once, then refer back only when starting a new feature or session.

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## First-time Setup

**Local dev:** `http://localhost:5173` (Vite dev server — `npm run dev`)
**Extension load:** Chrome → `chrome://extensions` → Load unpacked → `dist/`
**GitHub token:** Set `GITHUB_TOKEN` in `.env.local` (never commit)
**Test account:** Create a GitHub Personal Access Token with `repo` scope for integration tests

⚠ **Never use bare `fetch()` for GitHub API** — always use the `githubApi()` wrapper:
```javascript
githubApi().path('/repos/{owner}/{repo}/pulls/{pr}').get()   // ✅ includes auth + rate-limit retry
fetch('https://api.github.com/...')                           // ✗ — no auth, no retry
```

⚠ **Never hardcode API versions** — import from `src/config/api.js`:
```javascript
import { GITHUB_API_VERSION } from 'src/config/api.js'       // ✅
fetch('https://api.github.com/v3/...')                        // ✗ — retires without warning
```

**Quick re-auth (if token expires — browser console):**
```javascript
chrome.storage.local.set({ github_token: 'YOUR_TOKEN' }, () => location.reload())
```

---

## Working Style

- Proceed autonomously with setup, dependency installation, and exploratory commands. Do not defer to the user unless explicitly blocked.
- When asked for examples or analysis, use actual codebase data and real file references — never hypothetical examples.
- After any implementation, test in Chrome with the extension loaded from `dist/`. Report: "Tested in Chrome extension, console shows X, DOM shows Y."

---

## Configured Hooks (auto-run — not skill invocations)

| Hook | Trigger | What it does |
|------|---------|--------------|
| SessionStart | Start of every session | Runs `scripts/session-start.sh` — injects `/triage` instructions |
| PreToolUse | `git commit` | Runs `scripts/pre-commit-verify.sh` — reminds to run `/verify` before commit |
| PostToolUse | Write/Edit on `src/**` | `scripts/post-write-guard.sh` — scans for hardcoded tokens, animation without FPS logging |

**`.claude/settings.json`:**
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

## Quick Commands

### Running Tests

**Test runner decision:**
- User drags slider → sees animation → `tests/behavior/` (Playwright or Puppeteer)
- API contract (GitHub diff endpoint → response shape) → `tests/integration/`
- Pure logic (risk score formula, sort key, color mapping) → `tests/unit/`

```bash
npm run test                    # all tests (Vitest)
npm run test:unit               # unit only (pure logic — fastest)
npm run test:integration        # GitHub API contract tests
npm run test:behavior           # browser automation (Playwright/Puppeteer)
npm run test:watch              # watch mode during development
npm run test:coverage           # full suite + coverage report
npm run test:failures           # re-run only previously-failed tests
```

⚠ **Never run behavior tests against live GitHub API** — use the mock server (`npm run mock-api`).

### Starting Dev Environment

```bash
npm run dev             # Vite dev server + hot reload
npm run mock-api        # GitHub API mock server (required for integration tests)
npm run build           # production build → dist/
npm run build:watch     # incremental build (use when testing extension in Chrome)
```

### Operational Scripts

```bash
npm run guard           # scan for anti-patterns (read-only)
npm run guard:fix       # auto-fix safe violations only
npm run agents:cleanup  # remove stale agent worktrees (> 48h, completed)
npm run loop:archive    # prune loop state files (keep 7 most recent per loop name)
npm run health          # check that dev server + mock API are up
```

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
| Domain glossary | `docs/CONTEXT.md` — canonical term mappings |
| Architecture decisions | `docs/adr/` |
| Historical incidents | `agent-os/analysis/historical-incidents.md` |
| Skill catalog | `agent-os/product/skills.md` |
| Loop state files | `memory/loop-state-triage-YYYY-MM-DD.md` |

---

## Architecture

Browser extension (Chrome/GitKraken) that replays a pull request's diff as an animation driven by a time-bar slider. The risk indicator (low→high) colors line changes in real time based on a calculated risk score.

```
src/
├── background.js           # service worker: GitHub API calls, caching
├── content.js              # injected into GitHub/GitKraken PR pages
├── popup/
│   ├── popup.html
│   └── popup.js
├── components/
│   ├── TimeSlider.js       # time-bar slider + animation driver
│   ├── DiffViewer.js       # animated line change renderer
│   └── RiskIndicator.js    # low/medium/high color overlay
├── services/
│   ├── githubApi.js        # wrapper: auth + retry + rate limiting
│   └── diffParser.js       # GitHub diff → frame-by-frame change list
├── utils/
│   ├── riskCalculator.js   # pure fn: metrics → risk score (0–100)
│   └── animationEngine.js  # requestAnimationFrame loop + FPS logging
├── config/
│   └── api.js              # GITHUB_API_VERSION + endpoints (never hardcode)
└── styles/
    ├── animation.css        # animation keyframes
    ├── risk-colors.css      # WCAG AA verified color palette
    └── variables.css        # design tokens (z-index, timing, breakpoints)

tests/
├── behavior/               # Playwright: user drags slider, sees animation
├── integration/            # GitHub API mock: diff fetched, parsed, rendered
├── unit/                   # Pure logic: riskCalculator, diffParser, sort keys
└── helpers/
    ├── mockGithubApi.js    # shared GitHub API mock
    └── testFixtures.js     # known PR diffs for deterministic tests

memory/                     # loop state files (not committed)
├── loop-state-triage-YYYY-MM-DD.md
├── loop-state-verify-{slug}-YYYY-MM-DD.md
└── _archive/

agent-os/                   # standards + analysis (committed)
├── standards/global/
├── standards/testing/
└── analysis/

skills/                     # Claude Code skill files
├── triage/SKILL.md
├── verify/SKILL.md
├── guard/SKILL.md
├── quality-gate/SKILL.md
└── write-test/SKILL.md

docs/
├── CONTEXT.md              # domain glossary
├── adr/                    # architecture decisions
└── README.md
```

**Key domain terms (full glossary in `docs/CONTEXT.md`):**
- **Diff Frame** — a snapshot of a file at one commit in the PR history
- **Risk Score** — 0–100 value calculated per frame (size, churn, file type, author history)
- **Timeline** — the ordered sequence of commits in the PR; slider position maps to Timeline position
- **Chunk** — a contiguous block of added/removed/unchanged lines within a Diff Frame
- **Risk Threshold** — configurable breakpoints: 0–33 low (green), 34–66 medium (yellow), 67–100 high (red)

---

## Critical Code Patterns

**Animation frames — always log FPS:**
```javascript
// animationEngine.js — NEVER run an animation without frame timing
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

**Risk color changes — WCAG AA required (4.5:1 contrast):**
```css
/* risk-colors.css — test every color against background in Colour Contrast Analyser */
:root {
  --risk-low:    #1a7f37;   /* 5.2:1 on white */
  --risk-medium: #9a6700;   /* 4.6:1 on white */
  --risk-high:   #cf222e;   /* 5.1:1 on white */
}
```

**GitHub API — wrapper only, never bare fetch:**
```javascript
// services/githubApi.js wraps all calls with auth + exponential backoff
const pr = await githubApi().path(`/repos/${owner}/${repo}/pulls/${prNumber}`).get()
if (!pr.ok) { console.error('GitHub API error:', pr.status, pr.statusText); return }
const data = await pr.json()
```

**API response shape — always check before destructuring:**
```javascript
const data = await githubApi().path('/...').get().then(r => r.json())
if (data.status !== 'ok') { console.error('unexpected response:', data); return }
// safe to use data.diff, data.commits, etc.
```

**Listener cleanup — always remove in destroy():**
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
  // jump to final frame, skip animation
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

**Common extension gotchas:**

| Issue | Wrong assumption | Right diagnosis |
|-------|-----------------|-----------------|
| CSS not applying | Edit CSS file | Check CSP blocks inline styles; check shadow DOM isolation |
| API call fails silently | Network error | Check `chrome.runtime.lastError` in background.js |
| Slider moves but animation stutters | Logic error | Check `requestAnimationFrame` frame time log — PERF-001 |
| Risk color not visible | Color value wrong | Check WCAG contrast — RISK-001 (4.5:1 minimum) |
| Extension works in dev, breaks after build | Build config | Check Vite manifest.json + content script injection |
| `prefers-reduced-motion` ignored | Accessibility oversight | Check animationEngine.js respects the media query |

---

## Starting a Planning Session

State three things upfront:

1. **The goal** (not motivation) — "Build X" not "X is a problem"
2. **What it's NOT** — explicit exclusion prevents building the wrong thing
3. **Where to stop** — "commit the plan, I'll decide next steps" is the default gate

> "[goal]. Not [excluded scope]. Output: [artifact]. Commit. I'll decide whether to implement."

Examples:
- "Build TimeSlider component. Not: animation smoothness optimization. Output: component + behavior tests. Commit."
- "Add risk color transitions. Not: full WCAG audit. Output: risk-colors.css + contrast verification. Commit."

---

## Non-negotiable Test Rules

Emerged from Bridge project testing incidents (June 2026). Full rules: `agent-os/standards/testing/test-writing.md`.

- **Run tests before committing** — after implementing, run the relevant suite. If new code breaks existing tests, fix before proceeding.

- **RULE-01 (Proxy mocks):** If your domain objects have arity enforcement or uninitialized-state semantics, use a proxy wrapper in tests — plain object mocks return `undefined` where the real object returns a function, causing silent opposite behavior.

- **RULE-02 (Unconditional teardown):** Browser/page teardown in `afterAll` MUST be unconditional. Any conditional guard leaks the browser process and corrupts subsequent test files. Feature guards go inside individual `test()` bodies.
  ```javascript
  afterAll(async () => {
    await browser?.close()   // UNCONDITIONAL — no if-checks here
  })
  ```

- **RULE-03 (Setup probes):** Every test setup must include a probe that verifies application-observable behavior — not just that data exists in the DB/store.

- **RULE-04 (Selectors):** Use `data-testid` attributes over class selectors. When using classList assertions, add a comment citing the source file where the class is assigned, plus a negative assertion.

- **RULE-05 (Auth error paths):** Every login/auth test must assert: (1) URL did not change, (2) inline error element is visible with non-empty text, (3) raw JSON is not rendered in the page body.

- **RULE-06 (Multi-notation predicates):** If a condition can be satisfied by multiple data formats, test EVERY format in the test suite.

- **RULE-07 (Sort key boundaries):** Multi-component sort keys (e.g., commit_index + line_number) must include a cross-boundary assertion: `key(N+1, 0) > key(N, MAX)`. This catches weight inversions invisible within a single component.

**Always set explicit per-test timeouts** — default 2000ms is too low for browser automation:
```javascript
test('slider animates to 50%', async () => { ... }, 15000)
```

---

## Git & Commits

PRs target `main`. Max 72-char subject line.
Commit messages follow Conventional Commits: `type(scope): subject`
Examples: `fix(animation): prevent jank on 5000+ line diffs`, `feat(risk): add WCAG-verified color transitions`

Pre-commit blocks: bare `console.log` (allows `console.error`, `console.warn`, `// keep`), hardcoded GitHub API versions, hardcoded color values outside `risk-colors.css`.

Loop worktree commits (`[loop]` prefix) require human review before merging.

---

## Agent Skills

**Mandatory skills — run every time for the given trigger:**

| Skill | Trigger |
|-------|---------|
| `/triage` | Start of any session — discovers failing tests, guard issues, stale worktrees |
| `/guard` | Before writing any code — advisory scan for known anti-patterns |
| `/verify` | After any loop-writer agent completes — before human review of the output |
| `/quality-gate` | Before marking any phase complete or creating a PR |

**When you need X, use skill Y:**

| Need | Skill |
|------|-------|
| Write a test, unsure which runner | `/write-test` |
| Architectural decision | `/adr` |
| Bug took > 1 hour to diagnose | `/post-mortem` |
| New UI component | `/frontend-design` |

---

## Loop/Agent Workflow

All autonomous feature work follows three phases. **Writer and verifier are always separate processes.**

### Phase 1: Triage (read-only discovery)
Run `/triage` at session start. Output: prioritized work queue. State file written to `memory/loop-state-triage-YYYY-MM-DD.md`.

### Phase 2: Loop Writer (isolated worktree)
```
Worktree: .claude/worktrees/agent-{slug}-{YYYY-MM-DD}
Branch: agent-{slug}-{YYYY-MM-DD}
Commits tagged: [loop]
```
Writer **exits** before running any tests. Verification is NOT the writer's job.

### Phase 3: Loop Verify (independent verifier)
Receives only: worktree path. Runs `npm run test` + `npm run guard`. Returns PASS/FAIL. Writes `memory/loop-state-verify-{slug}-YYYY-MM-DD.md`.

- **PASS** → human reviews diff, marks "## Reviewed" in state file
- **FAIL** → new writer agent created with verifier's verdict as input (never re-prompt original writer)
- **Max 3 cycles** → escalate to human

### Human Review Required
Before merging any `[loop]` commit:
- [ ] Diff reviewed — logic is sound
- [ ] Tests pass (verifier ran them)
- [ ] Guard clean
- [ ] No hardcoded configuration
- [ ] Listener cleanup in `destroy()` present
- [ ] No `console.log` left behind
- [ ] `prefers-reduced-motion` handled (if animation)

Mark in state file: `## Reviewed: [x] {hash}: reviewed by {name} on {date}`

---

## Files to Create at Project Init

Run these commands to scaffold the `agent-os/` infrastructure:

```bash
mkdir -p agent-os/standards/global
mkdir -p agent-os/standards/testing
mkdir -p agent-os/analysis/retrospectives
mkdir -p agent-os/product
mkdir -p memory/_archive
mkdir -p skills/{triage,verify,guard,quality-gate,write-test}
mkdir -p docs/adr
mkdir -p scripts/agent-os
mkdir -p .claude/worktrees
```

**`agent-os/analysis/RECURRING-PATTERNS.md`** — seed with these patterns on day 1:

```markdown
# Recurring Patterns Registry

| Pattern ID | Severity | Description | Detection |
|---|---|---|---|
| ANIM-001 | High | Animation without FPS logging | grep -r "requestAnimationFrame" src/ without "console.warn" near |
| RISK-001 | Critical | Risk color without WCAG AA contrast check | CSS audit against 4.5:1 threshold |
| CODE-001 | High | Hardcoded DOM selectors in tests | grep -r "classList.contains" tests/ without "data-testid" |
| PERF-001 | High | Slider event causes full diff re-render | Profile: slider input → DOM mutations count |
| CACHE-001 | Medium | Extension CSS cached after update | Reload extension after build; test in Incognito |
| API-001 | High | GitHub API version hardcoded | grep -r "api.github.com/v" src/ |
| TEST-001 | Medium | Tests timeout on large diffs | Check test fixtures — use 50-line diffs, not real PRs |
| WCAG-001 | Critical | Animation ignores prefers-reduced-motion | grep -r "requestAnimationFrame" without "prefers-reduced-motion" check |
| LOOP-001 | High | [loop] commit merged without human review | git log --format="%H %s" | grep "\[loop\]" | cross-ref memory/ Reviewed entries |
```

**`agent-os/standards/global/loop-operations.md`** — loop state file format:

```markdown
# Loop Operations Standard

## State File Format

Location: `memory/loop-state-{loop-name}-{YYYY-MM-DD}.md`
Retention: keep 7 most recent per loop name; archive older to `memory/_archive/`

---
loop: {name}
date: YYYY-MM-DD
status: complete | partial | blocked | escalated
---

## Discovered
- [ ] {unresolved item}
- [x] {resolved item}

## Verified
- [x] {item}: test scope PASS, guard PASS — {ISO timestamp}

## Reviewed
- [ ] {commit hash}: pending review
- [x] {commit hash}: reviewed by {name} on YYYY-MM-DD

## Pending Human Review
- {item requiring decision — not automatable}

## Next Cycle
- {item to carry forward with reason}
```

**`agent-os/standards/global/verification-split.md`** — writer/verifier separation:

```markdown
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
```

**`docs/CONTEXT.md`** — domain glossary:

```markdown
# Domain Context

## Canonical Terms

| Term | Definition | Code location |
|---|---|---|
| Diff Frame | Snapshot of a file at one commit in the PR | `src/services/diffParser.js` |
| Timeline | Ordered sequence of commits; slider maps to this | `src/components/TimeSlider.js` |
| Risk Score | 0–100 calculated per frame | `src/utils/riskCalculator.js` |
| Risk Threshold | Breakpoints: 0-33 low, 34-66 medium, 67-100 high | `src/config/risk.js` |
| Chunk | Contiguous block of lines within a Diff Frame | `src/services/diffParser.js` |
| Animation Tick | One `requestAnimationFrame` callback — renders one Diff Frame | `src/utils/animationEngine.js` |
```

---

## What NOT to Carry from Bridge

These are Bridge-specific — do not port:

- `tries.check()` pattern (Bridge's failure injection system)
- `StemClass` / `withS` / `makeStemProxy` (Bridge's stem domain object pattern)
- Arca tables (`arca_books`, `arca_passages`)
- `common_be/` / `common/` workspace structure
- `VuBuild`, MinIO, SpaCy integrations
- `API().service('prep').path(...)` pattern (replace with your `githubApi()` wrapper)
- Folio/Portion/Streamlet domain terms

The **principles** behind these patterns carry — the specific implementations do not.

---

## Notes for James Owen (Code Reviewer Context)

This extension exists because PR diffs are hard to review when changes are mixed across many commits with no visual sense of "when" each change happened or how risky it is.

**Design intent:**
- The slider is the primary interaction — drag left to right to replay the PR in commit order
- Risk coloring is ambient — high-risk lines (large deletions, complex functions, critical files) glow red; low-risk lines are green
- The reviewer should be able to "feel" where the risky changes are before reading a single line of diff

**What "risky" means:** configurable, but defaults to: number of lines changed, cyclomatic complexity delta, file type (config/auth files = higher weight), author's historical change churn in that file.
