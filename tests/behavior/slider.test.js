/**
 * tests/behavior/slider.test.js
 *
 * Behavior tests: time-bar slider controls commit progression.
 *
 * Fixture: 3-commit JWT+RBAC PR (alice) — aaa0001, bbb0002, ccc0003
 * Commit positions on slider (2 + i/(n-1)*95):
 *   commit 0 (JWT middleware) → ~2%
 *   commit 1 (RBAC)          → ~49%
 *   commit 2 (tests)         → ~97%
 *
 * RULE-02: afterAll teardown is unconditional
 * RULE-03: beforeAll probes that the app rendered
 * RULE-04: all selectors use data-testid via shadow DOM evaluate()
 */

import { test, expect, chromium } from '@playwright/test'

const HARNESS_URL = '/tests/behavior/fixtures/app-harness.html'

// Shadow DOM helpers — all interaction goes through page.evaluate() since the
// app lives inside an open Shadow DOM attached to #host.
const sh = {
  /** Get the value of a data-testid element's property */
  get: (page, testid, prop = 'textContent') =>
    page.evaluate(
      ([tid, p]) => window.__shadow?.querySelector(`[data-testid="${tid}"]`)?.[p] ?? null,
      [testid, prop]
    ),

  /** Set a range input value and dispatch 'input' event */
  setSlider: (page, value) =>
    page.evaluate(v => {
      const sl = window.__shadow?.querySelector('[data-testid="time-slider"]')
      if (!sl) throw new Error('slider not found in shadow DOM')
      sl.value = v
      sl.dispatchEvent(new Event('input', { bubbles: true }))
    }, value),

  /** Click an element by data-testid */
  click: (page, testid) =>
    page.evaluate(tid => {
      const el = window.__shadow?.querySelector(`[data-testid="${tid}"]`)
      if (!el) throw new Error(`[data-testid="${tid}"] not found`)
      el.click()
    }, testid),

  /** Wait for shadow DOM element to appear */
  waitFor: (page, testid, timeout = 5000) =>
    page.waitForFunction(
      tid => !!window.__shadow?.querySelector(`[data-testid="${tid}"]`),
      testid,
      { timeout }
    ),
}

let browser, page

test.beforeAll(async () => {
  browser = await chromium.launch()
  page    = await browser.newPage()
  await page.goto(HARNESS_URL)

  // RULE-03: probe that the app fully rendered before any test runs
  await page.waitForFunction(() => window.__harnessDone === true, null, { timeout: 10_000 })
  await sh.waitFor(page, 'time-slider')
  await sh.waitFor(page, 'commit-message')
}, 30_000)

test.afterAll(async () => {
  await browser?.close()  // RULE-02: unconditional
})

// ─── Initial state ────────────────────────────────────────────────────────────

test('slider starts at 0 with no commit selected', async () => {
  const val = await sh.get(page, 'time-slider', 'value')
  expect(val).toBe('0')

  const msg = await sh.get(page, 'commit-message')
  expect(msg).toContain('Drag the slider')
}, 10_000)

test('commit hash shows placeholder before interaction', async () => {
  const hash = await sh.get(page, 'commit-hash')
  // RULE-04 negative assertion: placeholder, not a real hash
  expect(hash).not.toMatch(/^[0-9a-f]{7}$/)
}, 10_000)

// ─── Slider → commit mapping ──────────────────────────────────────────────────

test('dragging slider to ~2% reveals first commit', async () => {
  await sh.setSlider(page, 2)

  // RULE-03: wait for commit-message to update (observable behavior)
  await page.waitForFunction(
    () => !window.__shadow?.querySelector('[data-testid="commit-message"]')?.textContent?.includes('Drag'),
    null, { timeout: 5_000 }
  )

  const msg  = await sh.get(page, 'commit-message')
  const hash = await sh.get(page, 'commit-hash')

  expect(msg).toContain('JWT')
  expect(hash).toMatch(/^[0-9a-f]{7}$/)  // real hash, not placeholder
}, 15_000)

test('dragging slider to ~49% advances to second commit', async () => {
  await sh.setSlider(page, 49)

  await page.waitForFunction(
    () => {
      const msg = window.__shadow?.querySelector('[data-testid="commit-message"]')?.textContent ?? ''
      return msg.includes('role') || msg.includes('RBAC') || msg.includes('rbac')
    },
    null, { timeout: 5_000 }
  )

  const msg = await sh.get(page, 'commit-message')
  expect(msg.toLowerCase()).toMatch(/role|rbac/)
}, 15_000)

test('dragging slider to ~97% reaches third commit', async () => {
  await sh.setSlider(page, 97)

  await page.waitForFunction(
    () => {
      const msg = window.__shadow?.querySelector('[data-testid="commit-message"]')?.textContent ?? ''
      return msg.includes('test')
    },
    null, { timeout: 5_000 }
  )

  const msg = await sh.get(page, 'commit-message')
  expect(msg.toLowerCase()).toContain('test')
}, 15_000)

// ─── Slider → commit ordering ────────────────────────────────────────────────

test('commits advance in chronological order as slider moves right', async () => {
  // Reset to start
  await sh.setSlider(page, 0)

  const seen = []
  for (const pct of [2, 49, 97]) {
    await sh.setSlider(page, pct)
    await page.waitForFunction(
      ([pctVal]) => {
        const sl  = window.__shadow?.querySelector('[data-testid="time-slider"]')
        return sl && parseFloat(sl.value) >= pctVal - 1
      },
      [pct],
      { timeout: 3_000 }
    )
    const hash = await sh.get(page, 'commit-hash')
    if (hash && /^[0-9a-f]{7}$/.test(hash)) seen.push(hash)
  }

  // All three positions should show different hashes (different commits)
  const unique = new Set(seen)
  expect(unique.size).toBe(3)
}, 20_000)

// ─── Diff table population ───────────────────────────────────────────────────

test('diff table has rows after slider reaches first commit', async () => {
  await sh.setSlider(page, 2)
  await page.waitForFunction(
    () => (window.__shadow?.querySelector('[data-testid="diff-table-primary"]')?.querySelectorAll('tr').length ?? 0) > 0,
    null, { timeout: 5_000 }
  )

  const rowCount = await page.evaluate(
    () => window.__shadow?.querySelector('[data-testid="diff-table-primary"]')?.querySelectorAll('tr').length ?? 0
  )
  expect(rowCount).toBeGreaterThan(0)
}, 15_000)
