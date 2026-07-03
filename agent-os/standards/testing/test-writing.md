# Test Writing Rules

Emerged from Bridge project testing incidents (June 2026). These rules are non-negotiable.

---

## Which Runner to Use

| Scenario | Suite | Runner |
|---|---|---|
| User drags slider → sees animation update | `tests/behavior/` | Playwright |
| GitHub diff endpoint → response shape contract | `tests/integration/` | Vitest + mock server |
| Pure logic: risk score, sort key, color mapping | `tests/unit/` | Vitest |

Never run behavior tests against live GitHub API — use `npm run mock-api`.

---

## RULE-01 — Proxy Mocks

If domain objects have arity enforcement or uninitialized-state semantics, use a proxy wrapper in tests. Plain object mocks return `undefined` where the real object returns a function — this produces silent opposite behavior.

```javascript
// ✗ — plain mock silently returns undefined for missing methods
const mockDiff = { frames: [], getFrame: undefined }

// ✅ — proxy catches missing method access explicitly
const mockDiff = new Proxy({ frames: [] }, {
  get(target, key) {
    if (!(key in target)) throw new Error(`Unexpected access: ${String(key)}`)
    return target[key]
  }
})
```

---

## RULE-02 — Unconditional Teardown

Browser/page teardown in `afterAll` must be unconditional. Any conditional guard leaks the browser process and corrupts subsequent test files. Feature guards go inside individual `test()` bodies.

```javascript
// ✗ — conditional guard leaks browser process
afterAll(async () => {
  if (browser) await browser.close()
})

// ✅ — unconditional
afterAll(async () => {
  await browser?.close()
})
```

---

## RULE-03 — Setup Probes

Every test setup must include a probe that verifies application-observable behavior — not just that data exists in the store/DOM.

```javascript
// ✗ — only checks that data was set
beforeEach(async () => {
  await store.set('diff', fixtureDiff)
})

// ✅ — probes that the app rendered the data
beforeEach(async () => {
  await store.set('diff', fixtureDiff)
  await page.waitForSelector('[data-testid="diff-frame"]')  // observable
})
```

---

## RULE-04 — Selectors

Use `data-testid` attributes over class selectors. When a classList assertion is unavoidable, add:
1. A comment citing the source file where the class is assigned
2. A negative assertion alongside the positive one

```javascript
// ✗
expect(el.classList.contains('risk-high')).toBe(true)

// ✅
// class assigned in src/components/RiskIndicator.js:42
expect(el.classList.contains('risk-high')).toBe(true)
expect(el.classList.contains('risk-low')).toBe(false)   // negative assertion
```

---

## RULE-05 — Auth Error Paths

Every login/auth test must assert all three:
1. URL did not change
2. Inline error element is visible with non-empty text
3. Raw JSON is not rendered in the page body

```javascript
test('shows error on bad token', async () => {
  await submitBadToken()
  expect(page.url()).toBe(originalUrl)                          // 1
  const err = page.locator('[data-testid="auth-error"]')
  await expect(err).toBeVisible()
  expect((await err.textContent()).length).toBeGreaterThan(0)  // 2
  expect(await page.textContent('body')).not.toMatch(/^\{/)   // 3
}, 15000)
```

---

## RULE-06 — Multi-notation Predicates

If a condition can be satisfied by multiple data formats (e.g., string vs. number, snake_case vs. camelCase), test EVERY format in the suite.

---

## RULE-07 — Sort Key Boundaries

Multi-component sort keys (e.g., `commit_index + line_number`) must include a cross-boundary assertion to catch weight inversions invisible within a single component.

```javascript
// commit_index=1, line=MAX must sort before commit_index=2, line=0
expect(sortKey(2, 0)).toBeGreaterThan(sortKey(1, Number.MAX_SAFE_INTEGER))
```

---

## Timeouts

Default 2000ms is too low for browser automation. Set explicit timeouts on every behavior test.

```javascript
test('slider animates to 50%', async () => { ... }, 15000)
```

---

## Test Fixtures

Use small, deterministic fixtures — not real PR data. Keep fixture diffs under 50 lines. Real PRs introduce network dependency, rate limits, and non-determinism.

See `tests/helpers/testFixtures.js` for shared fixtures.
