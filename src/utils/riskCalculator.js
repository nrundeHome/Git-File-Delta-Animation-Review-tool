// Pure function — no side effects, deterministic output
// Input: file metrics. Output: risk score 0–100.
// Per RULE-07: sort key boundaries tested in tests/unit/riskCalculator.test.js

import { FILE_WEIGHTS, RISK_THRESHOLDS } from '../config/api.js'

/**
 * Compute a 0–100 risk score for a set of file metrics.
 *
 * @param {Object} params
 * @param {number} params.linesChanged     — total lines added + removed in this commit for this file
 * @param {number} params.complexityDelta  — cyclomatic complexity change (positive = more complex)
 * @param {number} params.weight           — file type weight multiplier (from fileTypeWeight())
 * @param {number} params.churn            — author commit count to this file in last 90 days
 * @returns {number} 0–100
 */
export function riskScore({ linesChanged, complexityDelta, weight, churn }) {
  // Three independent signals, each 0–100, combined with fixed weights
  const size  = Math.min(linesChanged    / 50,  1) * 40   // max 40pts: large diffs are risky
  const cx    = Math.min(complexityDelta / 10,  1) * 35   // max 35pts: added branches are risky
  const churnScore = Math.min(churn      / 20,  1) * 25   // max 25pts: high author churn = volatile file

  return Math.min(100, Math.round((size + cx + churnScore) * weight))
}

/**
 * Map a file path to its type weight multiplier.
 * Auth and config files are inherently higher risk regardless of diff size.
 */
export function fileTypeWeight(filepath) {
  const lower = filepath.toLowerCase()
  if (/\/(auth|authentication|session|oauth|jwt|token|credential)/.test(lower)) return FILE_WEIGHTS.auth
  if (/\/(middleware|interceptor|guard)/.test(lower))  return FILE_WEIGHTS.middleware
  if (/\/(config|configuration|env|settings)/.test(lower) || /(?:^|\/)\.env(?:\.|$)/.test(lower)) return FILE_WEIGHTS.config
  if (/\/(schema|model|migration|seed)/.test(lower))   return FILE_WEIGHTS.schema
  if (/\.(test|spec)\.[jt]sx?$/.test(lower))           return FILE_WEIGHTS.test
  if (/\/(mock|fixture|stub|factory)/.test(lower))      return FILE_WEIGHTS.mock
  return FILE_WEIGHTS.default
}

/**
 * Map a 0–100 score to a risk tier label.
 * Mirrors CSS token names in risk-colors.css.
 */
export function riskLevel(score) {
  if (score >= RISK_THRESHOLDS.HIGH) return 'hi'
  if (score >= RISK_THRESHOLDS.LOW)  return 'md'
  return 'lo'
}

/**
 * Compute aggregate risk score across all files in a commit.
 * Weighted by lines changed per file so large files dominate.
 */
export function commitRiskScore(fileScores) {
  // fileScores: [{ score, linesChanged }]
  if (!fileScores.length) return 0
  const totalLines = fileScores.reduce((s, f) => s + f.linesChanged, 0)
  if (totalLines === 0) return 0
  const weighted = fileScores.reduce((s, f) => s + f.score * f.linesChanged, 0)
  return Math.round(weighted / totalLines)
}
