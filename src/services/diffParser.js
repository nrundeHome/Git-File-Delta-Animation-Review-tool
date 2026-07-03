// Unified diff → frame model
// Input:  GitHub API commit files array (each has .patch, .filename, .additions, .deletions)
// Output: Map<filepath, DiffLine[]> where DiffLine has commit attribution + risk metadata

import { riskScore, fileTypeWeight } from '../utils/riskCalculator.js'

/**
 * @typedef {Object} DiffLine
 * @property {number}  lineNum    — line number in the final file
 * @property {'add'|'del'|'ctx'} type
 * @property {string}  content   — raw line content (without leading +/-/ )
 * @property {number}  commitIdx — index of commit that introduced this line
 * @property {string}  commitSha — sha of that commit
 * @property {'hi'|'md'|'lo'} risk — risk tier for this line
 * @property {number}  score     — 0–100 risk score
 */

/**
 * Build a frame model from an ordered array of commit file data.
 *
 * @param {Array}  commits      — ordered [{sha, message, author, files:[{filename,patch,...}]}]
 * @param {Object} churnMap     — { filepath: churnCount } from getAuthorChurn
 * @returns {Map<string, DiffLine[]>}
 */
export function buildFrameModel(commits, churnMap = {}) {
  // filepath → accumulated lines (keyed by lineNum for fast lookup)
  const fileLines = new Map()

  commits.forEach((commit, commitIdx) => {
    const files = commit.files ?? []
    files.forEach(file => {
      const { filename, patch, additions, deletions } = file
      if (!patch) return  // binary file or rename with no content change

      const churn  = churnMap[filename] ?? 0
      const weight = fileTypeWeight(filename)
      const baseScore = riskScore({ linesChanged: additions + deletions, complexityDelta: 0, weight, churn })

      const parsed = parsePatch(patch, filename, commitIdx, commit.sha, baseScore, additions + deletions)

      if (!fileLines.has(filename)) fileLines.set(filename, [])
      const existing = fileLines.get(filename)

      // Merge: deleted lines get marked, new lines appended at their positions
      mergeLines(existing, parsed)
    })
  })

  return fileLines
}

/**
 * Parse a unified diff patch string into DiffLine objects.
 */
function parsePatch(patch, filename, commitIdx, sha, baseScore, totalChanged) {
  const lines   = patch.split('\n')
  const result  = []
  let   lineNum = 0

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      // @@ -oldStart,oldCount +newStart,newCount @@
      const m = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) lineNum = parseInt(m[1]) - 1
      continue
    }

    const type    = raw[0] === '+' ? 'add' : raw[0] === '-' ? 'del' : 'ctx'
    const content = raw.slice(1)

    if (type !== 'del') lineNum++

    // Per-line complexity bump: count branch tokens
    const branchTokens = countBranchTokens(content)
    const lineScore = Math.min(100, Math.round(baseScore + branchTokens * 8))
    const risk = scoreToTier(lineScore)

    result.push({
      lineNum:   type === 'del' ? lineNum : lineNum,
      type,
      content,
      commitIdx,
      commitSha: sha,
      risk,
      score:     lineScore,
    })
  }

  return result
}

/**
 * Merge a new commit's parsed lines into the accumulated file lines array.
 * Deleted lines from previous commits are marked as removed at this commit.
 */
function mergeLines(existing, newLines) {
  newLines.forEach(line => {
    if (line.type === 'add') {
      existing.push(line)
    } else if (line.type === 'del') {
      // Find the existing line and mark it deleted at this commit
      const target = existing.find(l => l.lineNum === line.lineNum && l.type === 'add')
      if (target) {
        target.type = 'del'
        target.deletedAtCommit = line.commitIdx
      }
    }
    // ctx lines are not stored in the frame model — they're reconstructed on render
  })
}

// ─── Dangerous Window detection ────────────────────────────────────────────

/**
 * Detect inter-commit "dangerous windows" where an auth pattern exists
 * without a corresponding guard in the same commit.
 *
 * Returns array of { afterCommitIdx, beforeCommitIdx, description }
 */
export function detectDangerousWindows(commits) {
  const windows = []
  let   hasAuth = false
  let   hasGuard = false

  commits.forEach((commit, idx) => {
    const patches = (commit.files ?? []).map(f => f.patch ?? '').join('\n')
    const addedLines = patches.split('\n').filter(l => l.startsWith('+')).join('\n')

    const introducesAuth  = AUTH_PATTERNS.some(p => p.test(addedLines))
    const introducesGuard = GUARD_PATTERNS.some(p => p.test(addedLines))

    if (introducesAuth && !introducesGuard) {
      hasAuth  = true
      hasGuard = false
    }
    if (introducesGuard && hasAuth && !hasGuard) {
      hasGuard = true
      windows.push({
        openAtCommit:  idx - 1,
        closedAtCommit: idx,
        description: 'Auth verification added without access control — all authenticated users had full access between these commits.',
      })
    }
  })

  // Window still open at end of PR
  if (hasAuth && !hasGuard) {
    windows.push({
      openAtCommit:  commits.findIndex((_, i) => {
        const p = (commits[i].files ?? []).map(f => f.patch ?? '').join('\n')
        return AUTH_PATTERNS.some(pt => pt.test(p))
      }),
      closedAtCommit: null,
      description: 'Auth verification added but no role/permission guard found in this PR.',
    })
  }

  return windows
}

// ─── Pattern registries ────────────────────────────────────────────────────

const AUTH_PATTERNS = [
  /jwt\.verify/,
  /passport\.authenticate/,
  /verifyToken/,
  /requiresAuth/,
  /isAuthenticated/,
]

const GUARD_PATTERNS = [
  /requireRole/,
  /checkPermission/,
  /hasRole/,
  /authorize/,
  /can\(/,
  /acl\./,
  /rbac/i,
]

// ─── Utilities ─────────────────────────────────────────────────────────────

const BRANCH_TOKENS = /\bif\b|\belse\b|\bcatch\b|\bcase\b|\bfor\b|\bwhile\b|\?\.|&&|\|\||\?[^?]/g

function countBranchTokens(line) {
  return (line.match(BRANCH_TOKENS) ?? []).length
}

function scoreToTier(score) {
  if (score >= 67) return 'hi'
  if (score >= 34) return 'md'
  return 'lo'
}
