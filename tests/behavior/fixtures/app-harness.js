/**
 * tests/behavior/fixtures/app-harness.js
 *
 * Mounts DiffCast app with deterministic fixture data for Playwright tests.
 * Uses open Shadow DOM so Playwright can pierce and query elements.
 *
 * Exposes on window:
 *   window.__shadow       — the open ShadowRoot (use evaluate() to access)
 *   window.__harnessDone  — true once mountApp() has completed
 */

import { mountApp }                        from '/src/diffcast/app.js'
import { buildFrameModel, detectDangerousWindows } from '/src/services/diffParser.js'
import { commitRiskScore, fileTypeWeight, riskScore } from '/src/utils/riskCalculator.js'

// ─── Fixture commits (mirrors tests/helpers/testFixtures.js) ────────────────
// Kept inline here so the harness has no Vitest dependency.

const HARNESS_COMMITS = [
  {
    sha:    'aaa0001aaa0001aaa0001aaa0001aaa0001aaa00',
    commit: {
      message: 'feat(auth): add JWT validation middleware',
      author:  { name: 'alice', date: '2026-06-01T10:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename:  'src/auth/middleware.js',
        additions: 42, deletions: 0, changes: 42,
        patch: [
          '@@ -0,0 +1,10 @@',
          '+const jwt = require(\'jsonwebtoken\')',
          '+module.exports = function verifyToken(req, res, next) {',
          '+  const token = req.headers.authorization?.split(\' \')[1]',
          '+  if (!token) return res.status(401).json({ error: \'No token\' })',
          '+  try {',
          '+    req.user = jwt.verify(token, process.env.JWT_SECRET)',
          '+    next()',
          '+  } catch {',
          '+    res.status(401).json({ error: \'Invalid token\' })',
          '+  }',
          '+}',
        ].join('\n'),
      },
    ],
  },
  {
    sha:    'bbb0002bbb0002bbb0002bbb0002bbb0002bbb00',
    commit: {
      message: 'feat(auth): add role-based access control',
      author:  { name: 'alice', date: '2026-06-01T11:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename:  'src/auth/rbac.js',
        additions: 28, deletions: 0, changes: 28,
        patch: [
          '@@ -0,0 +1,7 @@',
          '+module.exports = function requireRole(role) {',
          '+  return (req, res, next) => {',
          '+    if (!req.user) return res.status(401).json({ error: \'Unauthenticated\' })',
          '+    if (req.user.role !== role) return res.status(403).json({ error: \'Forbidden\' })',
          '+    next()',
          '+  }',
          '+}',
        ].join('\n'),
      },
    ],
  },
  {
    sha:    'ccc0003ccc0003ccc0003ccc0003ccc0003ccc00',
    commit: {
      message: 'test(auth): add middleware unit tests',
      author:  { name: 'alice', date: '2026-06-01T12:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename:  'tests/auth/middleware.test.js',
        additions: 20, deletions: 0, changes: 20,
        patch: '@@ -0,0 +1,5 @@\n+describe(\'verifyToken\', () => {\n+  it(\'rejects missing token\', () => {})\n+  it(\'accepts valid token\', () => {})\n+})\n',
      },
    ],
  },
]

// ─── Build enriched commit objects (matches background.js loadPR output) ────

const enriched = HARNESS_COMMITS.map(c => ({
  sha:     c.sha,
  message: c.commit.message,
  author:  c.commit.author.name,
  date:    c.commit.author.date,
  files:   c.files ?? [],
}))

// ─── Compute derived data ────────────────────────────────────────────────────

const frameModel       = buildFrameModel(enriched, {})
const dangerousWindows = detectDangerousWindows(enriched)

const commitRiskScores = enriched.map(commit =>
  commitRiskScore(
    (commit.files ?? []).map(f => ({
      score:        riskScore({
        linesChanged:    f.additions + f.deletions,
        complexityDelta: 0,
        weight:          fileTypeWeight(f.filename),
        churn:           0,
      }),
      linesChanged: f.additions + f.deletions,
    }))
  )
)

// frameModel is a Map — convert to plain object (mirrors background.js mapToObject)
const frameModelObj = Object.fromEntries(frameModel)

const prData = {
  commits:           enriched,
  frameModel:        frameModelObj,
  commitRiskScores,
  dangerousWindows,
  truncated:         false,
  totalCommits:      enriched.length,
  tier:              'pro',
}

// ─── Mount ───────────────────────────────────────────────────────────────────

const host   = document.getElementById('host')
// Use OPEN mode so Playwright can pierce the shadow DOM in tests
const shadow = host.attachShadow({ mode: 'open' })

try {
  mountApp(shadow, prData, { owner: 'test-org', repo: 'fixture-repo', prNumber: 42 })

  // Expose to Playwright via window
  window.__shadow      = shadow
  window.__harnessDone = true
  window.__prData      = prData

  const status = document.getElementById('harness-status')
  if (status) status.textContent = `✓ mounted (${enriched.length} commits)`
} catch (err) {
  const status = document.getElementById('harness-status')
  if (status) { status.textContent = `✖ ${err.message}`; status.style.color = '#f85149' }
  console.error('[harness] mountApp failed:', err)
}
