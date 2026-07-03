/**
 * tests/behavior/viewToggle.test.js
 *
 * Behavior tests: Reviewer / Author view toggle and split-view button.
 *
 * Fixture: 3-commit JWT+RBAC PR (alice) — aaa0001, bbb0002, ccc0003
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
  /** Get a CSS class list as a string for a data-testid element */
  classes: (page, testid) =>
    page.evaluate(
      tid => window.__shadow?.querySelector(`[data-testid="${tid}"]`)?.className ?? null,
      testid
    ),

  /** Get a named attribute value from a data-testid element */
  attr: (page, testid, attribute) =>
    page.evaluate(
      ([tid, a]) => window.__shadow?.querySelector(`[data-testid="${tid}"]`)?.getAttribute(a) ?? null,
      [testid, attribute]
    ),

  /** Get a named attribute from a CSS selector (not data-testid) */
  attrSel: (page, selector, attribute) =>
    page.evaluate(
      ([sel, a]) => window.__shadow?.querySelector(sel)?.getAttribute(a) ?? null,
      [selector, attribute]
    ),

  /** Get textContent for a data-testid element */
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

  /** Check whether an element has a given CSS class */
  hasClass: (page, testid, cls) =>
    page.evaluate(
      ([tid, c]) => window.__shadow?.querySelector(`[data-testid="${tid}"]`)?.classList.contains(c) ?? false,
      [testid, cls]
    ),

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
  await sh.waitFor(page, 'view-btn-reviewer')
  await sh.waitFor(page, 'view-btn-author')
}, 30_000)

test.afterAll(async () => {
  await browser?.close()  // RULE-02: unconditional
})

// ─── Initial view state ───────────────────────────────────────────────────────

test('reviewer button is active on initial render', async () => {
  const isActive = await sh.hasClass(page, 'view-btn-reviewer', 'active')
  expect(isActive).toBe(true)
}, 10_000)

test('author button is inactive on initial render', async () => {
  const isActive = await sh.hasClass(page, 'view-btn-author', 'active')
  expect(isActive).toBe(false)
}, 10_000)

test('dc-app data-view attribute starts as "james"', async () => {
  const dataView = await sh.attrSel(page, '.dc-app', 'data-view')
  // Reviewer is the "james" view — RULE-04: positive assertion on attribute
  expect(dataView).toBe('james')
}, 10_000)

// ─── View toggle: reviewer → author ──────────────────────────────────────────

test('clicking author button activates it and deactivates reviewer', async () => {
  await sh.click(page, 'view-btn-author')

  const authorActive   = await sh.hasClass(page, 'view-btn-author', 'active')
  const reviewerActive = await sh.hasClass(page, 'view-btn-reviewer', 'active')

  expect(authorActive).toBe(true)
  expect(reviewerActive).toBe(false)
}, 10_000)

test('dc-app data-view attribute becomes "neil" after clicking author button', async () => {
  // Depends on previous test — author button already clicked
  const dataView = await sh.attrSel(page, '.dc-app', 'data-view')
  expect(dataView).toBe('neil')
}, 10_000)

// ─── View toggle: author → reviewer ──────────────────────────────────────────

test('clicking reviewer button restores it to active and deactivates author', async () => {
  await sh.click(page, 'view-btn-reviewer')

  const reviewerActive = await sh.hasClass(page, 'view-btn-reviewer', 'active')
  const authorActive   = await sh.hasClass(page, 'view-btn-author', 'active')

  expect(reviewerActive).toBe(true)
  expect(authorActive).toBe(false)
}, 10_000)

test('dc-app data-view attribute returns to "james" after clicking reviewer button', async () => {
  const dataView = await sh.attrSel(page, '.dc-app', 'data-view')
  expect(dataView).toBe('james')
}, 10_000)

// ─── Split-view button ────────────────────────────────────────────────────────

test('split button becomes visible after sliding to a commit', async () => {
  // Split button wrapper is hidden until a commit is loaded
  await sh.setSlider(page, 2)

  await page.waitForFunction(
    () => window.__shadow?.getElementById('splitBtnWrap')?.classList.contains('visible'),
    null, { timeout: 5_000 }
  )

  const wrapVisible = await page.evaluate(
    () => window.__shadow?.getElementById('splitBtnWrap')?.classList.contains('visible') ?? false
  )
  expect(wrapVisible).toBe(true)
}, 15_000)

test('split button is inactive before clicking', async () => {
  // Ensure we're in a clean split-off state (split button not active)
  const isActive = await sh.hasClass(page, 'split-btn', 'active')
  expect(isActive).toBe(false)
}, 10_000)

test('clicking split button activates it and changes label to "Single view"', async () => {
  await sh.click(page, 'split-btn')

  const isActive = await sh.hasClass(page, 'split-btn', 'active')
  const label    = await page.evaluate(
    () => window.__shadow?.getElementById('splitBtnLabel')?.textContent ?? null
  )

  expect(isActive).toBe(true)
  expect(label).toBe('Single view')
}, 10_000)

test('clicking split button again deactivates it and restores label to "Split view"', async () => {
  // Split is currently ON from the previous test — toggle it off
  await sh.click(page, 'split-btn')

  const isActive = await sh.hasClass(page, 'split-btn', 'active')
  const label    = await page.evaluate(
    () => window.__shadow?.getElementById('splitBtnLabel')?.textContent ?? null
  )

  expect(isActive).toBe(false)
  expect(label).toBe('Split view')
}, 10_000)
