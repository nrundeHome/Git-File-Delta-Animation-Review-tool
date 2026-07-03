/**
 * tests/behavior/fileSelect.test.js
 *
 * Behavior tests: file-list sidebar renders on mount and responds to selection.
 *
 * Fixture: 3-commit JWT+RBAC PR (alice) — aaa0001, bbb0002, ccc0003
 * Files in frameModel (built at mount time, covers all commits):
 *   src/auth/middleware.js   (commit 0 — JWT)
 *   src/auth/rbac.js         (commit 1 — RBAC)
 *   tests/auth/middleware.test.js  (commit 2 — tests)
 *
 * buildFileList() runs once at mountApp(); items are present before first slider drag.
 *
 * RULE-02: afterAll teardown is unconditional
 * RULE-03: beforeAll probes that the app rendered
 * RULE-04: all selectors use data-testid via shadow DOM evaluate()
 */

import { test, expect, chromium } from '@playwright/test'

const HARNESS_URL = '/tests/behavior/fixtures/app-harness.html'

const sh = {
  /** Get textContent for a data-testid element */
  get: (page, testid, prop = 'textContent') =>
    page.evaluate(
      ([tid, p]) => window.__shadow?.querySelector(`[data-testid="${tid}"]`)?.[p] ?? null,
      [testid, prop]
    ),

  /** Count elements matching a data-testid */
  count: (page, testid) =>
    page.evaluate(
      tid => window.__shadow?.querySelectorAll(`[data-testid="${tid}"]`).length ?? 0,
      testid
    ),

  /** Return the data-filepath attribute of all file-item elements, in DOM order */
  fileItemPaths: (page) =>
    page.evaluate(
      () => [...(window.__shadow?.querySelectorAll('[data-testid="file-item"]') ?? [])]
        .map(el => el.dataset.filepath)
    ),

  /** Return the data-filepath of the currently active file-item */
  activeFilePath: (page) =>
    page.evaluate(
      () => window.__shadow?.querySelector('[data-testid="file-item"].active')?.dataset.filepath ?? null
    ),

  /** Click a file-item by its data-filepath value */
  clickFile: (page, filepath) =>
    page.evaluate(fp => {
      const el = [...(window.__shadow?.querySelectorAll('[data-testid="file-item"]') ?? [])]
        .find(e => e.dataset.filepath === fp)
      if (!el) throw new Error(`file-item with filepath "${fp}" not found`)
      el.click()
    }, filepath),

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
  await sh.waitFor(page, 'file-list')
}, 30_000)

test.afterAll(async () => {
  await browser?.close()  // RULE-02: unconditional
})

// ─── File list renders on mount ───────────────────────────────────────────────

test('file-list is present in shadow DOM on initial render', async () => {
  const count = await sh.count(page, 'file-list')
  expect(count).toBe(1)
}, 10_000)

test('file list contains one item per file across all commits', async () => {
  // buildFileList() uses _fileKeys = Object.keys(frameModel) — all 3 fixture files
  const count = await sh.count(page, 'file-item')
  expect(count).toBe(3)
}, 10_000)

test('file items cover all fixture filenames', async () => {
  const paths = await sh.fileItemPaths(page)

  // RULE-06: assert each file is present by name (order may vary)
  expect(paths.some(p => p.includes('middleware.js') && p.includes('auth') && !p.includes('test'))).toBe(true)
  expect(paths.some(p => p.includes('rbac.js'))).toBe(true)
  expect(paths.some(p => p.includes('middleware.test.js'))).toBe(true)
}, 10_000)

// ─── Initial active file ──────────────────────────────────────────────────────

test('first file item is active on initial render', async () => {
  // buildFileList() sets idx===0 element to class "file-entry active"
  const activePath = await sh.activeFilePath(page)
  expect(activePath).toBeTruthy()

  // RULE-04: also assert no second item is active
  const activeCount = await page.evaluate(
    () => window.__shadow?.querySelectorAll('[data-testid="file-item"].active').length ?? 0
  )
  expect(activeCount).toBe(1)
}, 10_000)

// ─── File selection ───────────────────────────────────────────────────────────

test('clicking a second file item makes it active and deactivates the first', async () => {
  const paths       = await sh.fileItemPaths(page)
  const initialPath = await sh.activeFilePath(page)

  // Pick a file that is NOT the initially active one
  const targetPath = paths.find(p => p !== initialPath)
  expect(targetPath).toBeTruthy()  // fixture has 3 files so there is always another

  await sh.clickFile(page, targetPath)

  // Wait for active class to move
  await page.waitForFunction(
    fp => window.__shadow?.querySelector('[data-testid="file-item"].active')?.dataset.filepath === fp,
    targetPath,
    { timeout: 3_000 }
  )

  const activePath  = await sh.activeFilePath(page)
  const activeCount = await page.evaluate(
    () => window.__shadow?.querySelectorAll('[data-testid="file-item"].active').length ?? 0
  )

  expect(activePath).toBe(targetPath)
  expect(activeCount).toBe(1)
}, 15_000)

test('clicking a third file item moves active state correctly', async () => {
  const paths       = await sh.fileItemPaths(page)
  const currentPath = await sh.activeFilePath(page)

  // Pick a file different from the currently active one
  const targetPath = paths.find(p => p !== currentPath)
  expect(targetPath).toBeTruthy()

  await sh.clickFile(page, targetPath)

  await page.waitForFunction(
    fp => window.__shadow?.querySelector('[data-testid="file-item"].active')?.dataset.filepath === fp,
    targetPath,
    { timeout: 3_000 }
  )

  const activePath = await sh.activeFilePath(page)
  expect(activePath).toBe(targetPath)
}, 15_000)

// ─── File selection updates filepath display ──────────────────────────────────

test('selecting a file updates the filepath display element', async () => {
  const paths = await sh.fileItemPaths(page)

  // Click the last file in the list
  const targetPath = paths[paths.length - 1]
  await sh.clickFile(page, targetPath)

  await page.waitForFunction(
    fp => {
      const fpEl = window.__shadow?.getElementById('filepath')
      return fpEl && fpEl.textContent === fp
    },
    targetPath,
    { timeout: 3_000 }
  )

  const displayed = await page.evaluate(
    () => window.__shadow?.getElementById('filepath')?.textContent ?? null
  )
  expect(displayed).toBe(targetPath)
}, 15_000)
