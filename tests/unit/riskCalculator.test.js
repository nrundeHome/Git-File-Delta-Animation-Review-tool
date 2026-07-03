// Unit tests for riskCalculator.js
// Pure logic — no browser APIs, no network, deterministic

import { describe, it, expect } from 'vitest'
import { riskScore, fileTypeWeight, riskLevel, commitRiskScore } from '../../src/utils/riskCalculator.js'

// ─── riskScore ─────────────────────────────────────────────────────────────

describe('riskScore', () => {
  it('returns 0 for a zero-change file', () => {
    expect(riskScore({ linesChanged: 0, complexityDelta: 0, weight: 1.0, churn: 0 })).toBe(0)
  })

  it('caps at 100 for extreme inputs', () => {
    expect(riskScore({ linesChanged: 1000, complexityDelta: 100, weight: 2.0, churn: 100 })).toBe(100)
  })

  it('size signal: 50 lines = 40 pts base (before weight)', () => {
    const score = riskScore({ linesChanged: 50, complexityDelta: 0, weight: 1.0, churn: 0 })
    expect(score).toBe(40)
  })

  it('complexity signal: 10 delta = 35 pts base', () => {
    const score = riskScore({ linesChanged: 0, complexityDelta: 10, weight: 1.0, churn: 0 })
    expect(score).toBe(35)
  })

  it('churn signal: 20 commits = 25 pts base', () => {
    const score = riskScore({ linesChanged: 0, complexityDelta: 0, weight: 1.0, churn: 20 })
    expect(score).toBe(25)
  })

  it('auth weight doubles the score', () => {
    const base = riskScore({ linesChanged: 25, complexityDelta: 5, weight: 1.0, churn: 10 })
    const auth = riskScore({ linesChanged: 25, complexityDelta: 5, weight: 2.0, churn: 10 })
    expect(auth).toBe(Math.min(100, base * 2))
  })

  it('test file weight reduces score to 40% of base', () => {
    const base = riskScore({ linesChanged: 50, complexityDelta: 0, weight: 1.0, churn: 0 })
    const test = riskScore({ linesChanged: 50, complexityDelta: 0, weight: 0.4, churn: 0 })
    expect(test).toBe(Math.round(base * 0.4))
  })
})

// ─── fileTypeWeight ────────────────────────────────────────────────────────

describe('fileTypeWeight', () => {
  it('auth paths get 2.0 weight', () => {
    expect(fileTypeWeight('src/auth/middleware.js')).toBe(2.0)
    expect(fileTypeWeight('lib/authentication/session.ts')).toBe(2.0)
    expect(fileTypeWeight('utils/jwt.js')).toBe(2.0)
  })

  it('config paths get 1.6 weight', () => {
    expect(fileTypeWeight('src/config/api.js')).toBe(1.6)
    expect(fileTypeWeight('.env.production')).toBe(1.6)
  })

  it('test files get 0.4 weight', () => {
    expect(fileTypeWeight('tests/unit/foo.test.js')).toBe(0.4)
    expect(fileTypeWeight('src/__tests__/foo.spec.ts')).toBe(0.4)
  })

  it('unknown paths get 1.0 weight', () => {
    expect(fileTypeWeight('src/components/Button.js')).toBe(1.0)
    expect(fileTypeWeight('README.md')).toBe(1.0)
  })
})

// ─── riskLevel ─────────────────────────────────────────────────────────────

describe('riskLevel', () => {
  it('0–33 → lo', () => {
    expect(riskLevel(0)).toBe('lo')
    expect(riskLevel(33)).toBe('lo')
  })
  it('34–66 → md', () => {
    expect(riskLevel(34)).toBe('md')
    expect(riskLevel(66)).toBe('md')
  })
  it('67–100 → hi', () => {
    expect(riskLevel(67)).toBe('hi')
    expect(riskLevel(100)).toBe('hi')
  })
})

// ─── commitRiskScore — RULE-07: cross-boundary sort key assertion ───────────

describe('commitRiskScore', () => {
  it('returns 0 for empty array', () => {
    expect(commitRiskScore([])).toBe(0)
  })

  it('returns 0 when all files have 0 lines', () => {
    expect(commitRiskScore([{ score: 80, linesChanged: 0 }])).toBe(0)
  })

  it('weights larger files more heavily than small files', () => {
    // A 100-line high-risk file should dominate a 1-line low-risk file
    const dominated = commitRiskScore([
      { score: 90, linesChanged: 100 },
      { score: 5,  linesChanged: 1   },
    ])
    const reversed = commitRiskScore([
      { score: 5,  linesChanged: 100 },
      { score: 90, linesChanged: 1   },
    ])
    expect(dominated).toBeGreaterThan(reversed)
  })

  // RULE-07: multi-component sort key cross-boundary assertion
  // A commit with N+1 files at score 0 must rank lower than N files at score 100
  it('RULE-07: adding a zero-score file does not flip ranking above a high-score commit', () => {
    const highRisk  = commitRiskScore([{ score: 80, linesChanged: 10 }])
    const diluted   = commitRiskScore([{ score: 80, linesChanged: 10 }, { score: 0, linesChanged: 1000 }])
    // diluted should be lower (large zero-risk file pulls average down)
    expect(diluted).toBeLessThan(highRisk)
  })
})
