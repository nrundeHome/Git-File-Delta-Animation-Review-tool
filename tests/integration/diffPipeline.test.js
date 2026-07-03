// Integration tests: GitHub API response → buildFrameModel → commitRiskScore → detectDangerousWindows
// Uses fixture data only — no real network calls.
// Per CLAUDE.md RULE-01: proxy wrappers, not plain object mocks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildFrameModel, detectDangerousWindows } from '../../src/services/diffParser.js'
import { commitRiskScore, fileTypeWeight, riskScore, riskLevel } from '../../src/utils/riskCalculator.js'
import {
  FIXTURE_COMMITS,
  FIXTURE_EMPTY_COMMIT,
  FIXTURE_DW_COMMITS,
  FIXTURE_NO_DW_COMMITS,
  FIXTURE_COMMIT_2_AUTH_SCORE_MIN,
  FIXTURE_COMMIT_2_AUTH_SCORE_MAX,
} from '../helpers/testFixtures.js'

// ─── buildFrameModel ──────────────────────────────────────────────────────

describe('buildFrameModel', () => {
  it('returns an empty Map for commits with no files', () => {
    const model = buildFrameModel([FIXTURE_EMPTY_COMMIT])
    expect(model.size).toBe(0)
  })

  it('returns an entry for each unique file touched across all commits', () => {
    const model = buildFrameModel(FIXTURE_COMMITS)
    expect(model.has('src/app.js')).toBe(true)
    expect(model.has('src/config/settings.js')).toBe(true)
    expect(model.has('src/auth/middleware.js')).toBe(true)
  })

  it('each file entry contains DiffLine objects with required fields', () => {
    const model = buildFrameModel(FIXTURE_COMMITS)
    const lines = model.get('src/auth/middleware.js')
    expect(lines).toBeDefined()
    expect(lines.length).toBeGreaterThan(0)
    const line = lines[0]
    expect(line).toHaveProperty('type')
    expect(line).toHaveProperty('content')
    expect(line).toHaveProperty('commitIdx')
    expect(line).toHaveProperty('risk')
    expect(line).toHaveProperty('score')
    expect(['add', 'del', 'ctx']).toContain(line.type)
    expect(['hi', 'md', 'lo']).toContain(line.risk)
  })

  it('auth middleware lines have elevated risk vs app.js lines', () => {
    const model = buildFrameModel(FIXTURE_COMMITS)
    const authLines  = model.get('src/auth/middleware.js')
    const appLines   = model.get('src/app.js')
    const avgAuthScore = authLines.reduce((s, l) => s + l.score, 0) / authLines.length
    const avgAppScore  = appLines.reduce((s, l) => s + l.score, 0) / appLines.length
    expect(avgAuthScore).toBeGreaterThan(avgAppScore)
  })

  it('handles commits with binary files (null patch) without throwing', () => {
    const commits = [{ sha: 'x', commit: { message: 'bin', author: { name: 'a', date: '' } },
                       files: [{ filename: 'image.png', patch: null, additions: 0, deletions: 0 }] }]
    expect(() => buildFrameModel(commits)).not.toThrow()
  })
})

// ─── Risk pipeline ────────────────────────────────────────────────────────

describe('risk pipeline: fileTypeWeight → riskScore → riskLevel', () => {
  // src/auth/middleware.js: the /auth/ pattern matches before /middleware/ → weight 2.0
  it('auth middleware file gets weight 2.0 (auth pattern takes priority)', () => {
    expect(fileTypeWeight('src/auth/middleware.js')).toBe(2.0)
  })

  // A path under /middleware/ but not /auth/ → weight 1.8
  it('non-auth middleware file gets weight 1.8', () => {
    expect(fileTypeWeight('src/middleware/logger.js')).toBe(1.8)
  })

  it('config file gets weight 1.6', () => {
    expect(fileTypeWeight('src/config/settings.js')).toBe(1.6)
  })

  it('fixture commit 2 (JWT auth, 14 lines) scores in expected range', () => {
    const file = FIXTURE_COMMITS[1].files[0]
    const weight = fileTypeWeight(file.filename)
    const score  = riskScore({
      linesChanged:    file.additions + file.deletions,
      complexityDelta: 0,
      weight,
      churn:           0,
    })
    expect(score).toBeGreaterThanOrEqual(FIXTURE_COMMIT_2_AUTH_SCORE_MIN)
    expect(score).toBeLessThanOrEqual(FIXTURE_COMMIT_2_AUTH_SCORE_MAX)
  })

  it('commitRiskScore aggregates file scores weighted by lines changed', () => {
    const fileScores = FIXTURE_COMMITS.map(commit =>
      commit.files.map(f => ({
        score:        riskScore({ linesChanged: f.additions + f.deletions, complexityDelta: 0,
                                  weight: fileTypeWeight(f.filename), churn: 0 }),
        linesChanged: f.additions + f.deletions,
      }))
    ).map(fs => commitRiskScore(fs))

    // All scores in valid range
    fileScores.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    })

    // Commit 2 (auth) should be higher risk than commit 1 (scaffold)
    expect(fileScores[1]).toBeGreaterThan(fileScores[0])
  })

  it('riskLevel returns a valid tier for all computed scores', () => {
    const scores = [0, 1, 33, 34, 66, 67, 100]
    scores.forEach(s => {
      expect(['hi', 'md', 'lo']).toContain(riskLevel(s))
    })
  })
})

// ─── Dangerous window detection ───────────────────────────────────────────

describe('detectDangerousWindows — fixture scenarios', () => {
  it('detects window in auth-then-guard fixture (opens and closes)', () => {
    const windows = detectDangerousWindows(FIXTURE_DW_COMMITS)
    expect(windows).toHaveLength(1)
    expect(windows[0].openAtCommit).toBe(0)
    expect(windows[0].closedAtCommit).toBe(1)
  })

  it('no window when auth and guard are in the same commit', () => {
    const windows = detectDangerousWindows(FIXTURE_NO_DW_COMMITS)
    expect(windows).toHaveLength(0)
  })

  it('detects window in FIXTURE_COMMITS (JWT added in commit 1, RBAC closes it in commit 2)', () => {
    // FIXTURE_COMMITS: commit 1 introduces jwt.verify (auth), commit 2 adds requireRole (guard)
    const windows = detectDangerousWindows(FIXTURE_COMMITS)
    expect(windows.length).toBeGreaterThanOrEqual(1)
    const firstWindow = windows[0]
    expect(firstWindow).toHaveProperty('openAtCommit')
    expect(firstWindow).toHaveProperty('closedAtCommit')
    expect(firstWindow).toHaveProperty('description')
    // Window opened when JWT was added (commit index 1), closed when RBAC arrived (commit index 2)
    expect(firstWindow.openAtCommit).toBe(1)
    expect(firstWindow.closedAtCommit).toBe(2)
  })
})

// ─── RULE-07: pipeline produces stable sort keys ──────────────────────────

describe('RULE-07: commitRiskScore sort key stability', () => {
  it('adding a zero-risk file does not flip a high-risk commit above baseline', () => {
    const highRisk = commitRiskScore([{ score: 75, linesChanged: 20 }])
    const diluted  = commitRiskScore([{ score: 75, linesChanged: 20 }, { score: 0, linesChanged: 500 }])
    expect(diluted).toBeLessThan(highRisk)
  })

  it('RULE-07: key(N+1, 0) <= key(N, MAX) — adding a zero file never outranks all-high', () => {
    const allHigh  = commitRiskScore(Array.from({ length: 10 }, () => ({ score: 90, linesChanged: 10 })))
    const withZero = commitRiskScore([...Array.from({ length: 11 }, () => ({ score: 90, linesChanged: 10 })), { score: 0, linesChanged: 1 }])
    // withZero should be equal or slightly lower because of the diluting 0-score file
    expect(withZero).toBeLessThanOrEqual(allHigh)
  })
})
