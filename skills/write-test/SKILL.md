# /write-test

**When:** Writing a new test and unsure which runner or how to structure it.  
**Output:** Test file scaffold following RULE-01 through RULE-07.

---

## Step 1 — Pick the runner

Answer these questions:

| Question | Answer → Suite |
|----------|---------------|
| Does it require a browser or DOM? | `tests/behavior/` (Playwright) |
| Does it call the GitHub API (even mocked)? | `tests/integration/` (Vitest + mock server) |
| Is it pure logic with no I/O? | `tests/unit/` (Vitest) |

**Never mix runners.** A unit test that imports from `githubApi.js` belongs in integration.

---

## Step 2 — Check the rules before writing

Read `agent-os/standards/testing/test-writing.md`. Key reminders:

**RULE-01** — Use proxy mocks, not plain objects:
```javascript
// ✗
const mockEngine = { play: undefined, pause: undefined }
// ✓
const mockEngine = new Proxy({ play: vi.fn(), pause: vi.fn() }, {
  get(t, k) { if (!(k in t)) throw new Error(`Unexpected access: ${String(k)}`); return t[k] }
})
```

**RULE-02** — Teardown must be unconditional:
```javascript
afterAll(async () => {
  await browser?.close()  // ✓ unconditional
})
```

**RULE-04** — Prefer `data-testid` over class selectors:
```javascript
page.locator('[data-testid="risk-indicator"]')  // ✓
page.locator('.risk-high')                       // ✗ unless with source comment + negative assertion
```

**RULE-05** — Auth tests must check all three: URL unchanged, error visible, no raw JSON.

**RULE-07** — Sort key tests must include cross-boundary assertion.

---

## Step 3 — Scaffold template

### Unit test (Vitest)
```javascript
import { describe, it, expect } from 'vitest'
import { functionUnderTest } from '../../src/utils/yourModule.js'

describe('functionUnderTest', () => {
  it('does X for input Y', () => {
    expect(functionUnderTest(Y)).toBe(X)
  })

  it('caps at boundary Z', () => {
    expect(functionUnderTest(BigInput)).toBeLessThanOrEqual(Z)
  })
})
```

### Integration test (Vitest + mock)
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FIXTURE_COMMITS } from '../helpers/testFixtures.js'

vi.mock('../../src/services/githubApi.js', () => ({
  getPRCommits:  vi.fn(),
  getCommitFiles: vi.fn(),
  getAuthorChurn: vi.fn(),
}))

import { getPRCommits } from '../../src/services/githubApi.js'
import { buildFrameModel } from '../../src/services/diffParser.js'

describe('diff pipeline', () => {
  beforeEach(() => {
    getPRCommits.mockResolvedValue(FIXTURE_COMMITS)
  })

  it('builds frame model from fixture commits', async () => {
    const model = buildFrameModel(FIXTURE_COMMITS)
    // RULE-03: probe observable output, not just data existence
    expect(model.size).toBeGreaterThan(0)
    expect([...model.values()].every(lines => Array.isArray(lines))).toBe(true)
  })
})
```

### Behavior test (Playwright)
```javascript
import { test, expect, chromium } from '@playwright/test'

let browser, page

test.beforeAll(async () => {
  browser = await chromium.launch()
  page    = await browser.newPage()
  await page.goto('http://localhost:5173')
  // RULE-03: probe that the app rendered before testing
  await page.waitForSelector('[data-testid="time-slider"]')
})

test.afterAll(async () => {
  await browser?.close()  // RULE-02: unconditional
})

test('slider advances to 50%', async () => {
  const slider = page.locator('[data-testid="time-slider"]')
  await slider.fill('50')
  await expect(page.locator('[data-testid="commit-card"]')).toBeVisible()
}, 15000)  // RULE: explicit timeout
```

---

## Step 4 — Fixtures

Use `tests/helpers/testFixtures.js`. Do not inline large diffs — keep under 50 lines (TEST-001).

If the fixture doesn't exist yet, add it to `testFixtures.js` with a comment explaining the scenario it covers.

---

## Step 5 — Run and confirm

```bash
npm run test:unit      # or :integration or :behavior
```

All existing tests must still pass. New test must pass.
