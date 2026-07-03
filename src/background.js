// Service Worker — GitHub API calls, caching, license validation
// Per ADR-001 (MV3): all API calls originate here, never from content scripts
// Per ADR-004: PAT stored in chrome.storage.local, token never sent to DiffCast servers

import { getPRCommits, getCommitFiles, getAuthorChurn, validateLicense } from './services/githubApi.js'
import { buildFrameModel, detectDangerousWindows } from './services/diffParser.js'
import { commitRiskScore, fileTypeWeight, riskScore } from './utils/riskCalculator.js'
import { CACHE_TTL, FREE_TIER } from './config/api.js'

// ─── Message router ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }))
  return true  // keep channel open for async response
})

async function handleMessage(msg, _sender) {
  switch (msg.type) {
    case 'LOAD_PR': {
      // Dev mode: prNumber=0 always returns mock data (no token required)
      const { token } = await getToken()
      if (!token || msg.prNumber === 0) return MOCK_PR_DATA
      return loadPR(msg.owner, msg.repo, msg.prNumber)
    }
    case 'GET_PR_RISK_BATCH': return getPRRiskBatch(msg.owner, msg.repo, msg.prNumbers)
    case 'SET_TOKEN':     return setToken(msg.token)
    case 'GET_TOKEN':     return getToken()
    case 'CHECK_LICENSE': return checkLicense(msg.key)
    case 'GET_TIER':      return getTier()
    default:
      throw new Error(`Unknown message type: ${msg.type}`)
  }
}

// ─── PR loading ────────────────────────────────────────────────────────────

async function loadPR(owner, repo, prNumber) {
  const tier = await getTier()

  // Fetch commit list
  const rawCommits = await getPRCommits(owner, repo, prNumber)

  // Gate: free tier limits
  const commits = tier.tier === 'free'
    ? rawCommits.slice(0, FREE_TIER.MAX_COMMITS)
    : rawCommits

  // Fetch file diffs for each commit in parallel (batched to avoid rate limits)
  const commitDetails = await batchFetch(
    commits.map(c => () => getCommitFiles(owner, repo, c.sha)),
    { concurrency: 3 }
  )

  // Build author churn map for all unique filepaths
  const allFiles  = [...new Set(commitDetails.flatMap(c => (c.files ?? []).map(f => f.filename)))]
  const author    = commits[0]?.commit?.author?.login ?? commits[0]?.author?.login ?? ''
  const churnMap  = {}
  for (const filepath of allFiles) {
    churnMap[filepath] = await getAuthorChurn(owner, repo, filepath, author)
  }

  // Merge commit metadata with file details
  const enriched = commits.map((c, i) => ({
    sha:     c.sha,
    message: c.commit.message,
    author:  c.commit.author?.name ?? author,
    date:    c.commit.author?.date,
    files:   commitDetails[i]?.files ?? [],
  }))

  // Build frame model
  const frameModel       = buildFrameModel(enriched, churnMap)
  const dangerousWindows = detectDangerousWindows(enriched)

  // Compute per-commit aggregate risk scores
  const commitRiskScores = enriched.map(commit => {
    const fileScores = (commit.files ?? []).map(f => ({
      score:        riskScore({
        linesChanged:    f.additions + f.deletions,
        complexityDelta: 0,
        weight:          fileTypeWeight(f.filename),
        churn:           churnMap[f.filename] ?? 0,
      }),
      linesChanged: f.additions + f.deletions,
    }))
    return commitRiskScore(fileScores)
  })

  return {
    commits:        enriched,
    frameModel:     mapToObject(frameModel),
    dangerousWindows,
    commitRiskScores,
    truncated:      tier.tier === 'free' && rawCommits.length > FREE_TIER.MAX_COMMITS,
    totalCommits:   rawCommits.length,
    tier:           tier.tier,
  }
}

// ─── Token management ──────────────────────────────────────────────────────

async function setToken(token) {
  await chrome.storage.local.set({ github_token: token })
  return { ok: true }
}

async function getToken() {
  const { github_token } = await chrome.storage.local.get('github_token')
  return { token: github_token ?? null }
}

// ─── License / tier ────────────────────────────────────────────────────────

async function checkLicense(key) {
  const result = await validateLicense(key)
  if (result.valid) {
    await chrome.storage.local.set({
      license: { key, ...result, cachedAt: Date.now() },
    })
  }
  return result
}

async function getTier() {
  const { license } = await chrome.storage.local.get('license')
  if (!license) return { tier: 'free' }
  // Re-validate if cached > 24hr
  if (Date.now() - license.cachedAt > CACHE_TTL.LICENSE) {
    return checkLicense(license.key)
  }
  return { tier: license.tier ?? 'free', seats: license.seats ?? 0 }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

async function batchFetch(fns, { concurrency = 3 } = {}) {
  const results = []
  for (let i = 0; i < fns.length; i += concurrency) {
    const batch = fns.slice(i, i + concurrency).map(fn => fn())
    results.push(...await Promise.all(batch))
  }
  return results
}

function mapToObject(map) {
  const obj = {}
  for (const [k, v] of map) obj[k] = v
  return obj
}

// ─── PR list risk batch ────────────────────────────────────────────────────
// Lightweight — fetches only commit list (no diffs) to estimate risk per PR.
// With no token, returns deterministic scores so badges render in dev mode.

async function getPRRiskBatch(owner, repo, prNumbers) {
  const { token } = await getToken()

  if (!token) {
    // Dev mode: stable varied scores from PR number (Knuth multiplicative hash)
    return prNumbers.map(n => ({
      prNumber: n,
      score:    deterministicScore(n),
    }))
  }

  // With token: fetch commit list for each PR (no diffs → fast)
  const results = await batchFetch(
    prNumbers.slice(0, 10).map(n => async () => {
      try {
        const commits = await getPRCommits(owner, repo, n)
        // Proxy score: commit count × 8, capped at 100
        // Rough signal — Phase 2 will use full riskScore pipeline
        const score = Math.min(100, (commits?.length ?? 0) * 8)
        return { prNumber: n, score }
      } catch {
        return { prNumber: n, score: null }
      }
    }),
    { concurrency: 3 }
  )
  return results
}

function deterministicScore(prNumber) {
  // Knuth multiplicative hash → 0–99, stable per PR number
  return ((prNumber * 2654435761) >>> 0) % 100
}


// Mirrors the JWT/RBAC 3-commit scenario from experiments/01-diff-animation/index.html
// Shape must match the prData contract expected by src/diffcast/app.js

const MOCK_PR_DATA = (() => {
  const commits = [
    { sha: 'aaa111', message: 'Add JWT verification middleware', author: 'James Owen', date: '2024-09-01T10:00:00Z', files: [] },
    { sha: 'bbb222', message: 'Add role-based access control',   author: 'James Owen', date: '2024-09-01T11:30:00Z', files: [] },
    { sha: 'ccc333', message: 'Add audit logging for auth events', author: 'James Owen', date: '2024-09-01T13:00:00Z', files: [] },
  ]

  // Minimal DiffLine arrays per file
  function lines(filepath, commitIdx, sha, risk, score, addedLines) {
    return addedLines.map((content, i) => ({
      lineNum:   i + 1,
      type:      'add',
      content,
      commitIdx,
      commitSha: sha,
      risk,
      score,
    }))
  }

  const frameModel = {
    'src/middleware/auth.js': [
      ...lines('src/middleware/auth.js', 0, 'aaa111', 'hi', 78, [
        "import jwt from 'jsonwebtoken'",
        '',
        'export function verifyToken(req, res, next) {',
        "  const token = req.headers['authorization']?.split(' ')[1]",
        '  if (!token) return res.status(401).json({ error: "Unauthorized" })',
        '  try {',
        '    req.user = jwt.verify(token, process.env.JWT_SECRET)',
        '    next()',
        '  } catch (err) {',
        '    res.status(401).json({ error: "Invalid token" })',
        '  }',
        '}',
      ]),
      ...lines('src/middleware/auth.js', 1, 'bbb222', 'hi', 82, [
        '',
        'export function requireRole(...roles) {',
        '  return (req, res, next) => {',
        '    if (!req.user) return res.status(401).json({ error: "Unauthorized" })',
        '    if (!roles.includes(req.user.role)) {',
        '      return res.status(403).json({ error: "Forbidden" })',
        '    }',
        '    next()',
        '  }',
        '}',
      ]),
    ],
    'src/config/auth.config.js': [
      ...lines('src/config/auth.config.js', 0, 'aaa111', 'hi', 85, [
        "export const JWT_SECRET    = process.env.JWT_SECRET",
        "export const JWT_EXPIRES   = process.env.JWT_EXPIRES ?? '24h'",
        "export const ALLOWED_ROLES = ['admin', 'editor', 'viewer']",
      ]),
    ],
    'src/services/auditLog.js': [
      ...lines('src/services/auditLog.js', 2, 'ccc333', 'md', 45, [
        "import { db } from '../db'",
        '',
        'export async function logAuthEvent(userId, action, meta = {}) {',
        "  await db('audit_log').insert({",
        '    user_id:    userId,',
        '    action,',
        '    meta:       JSON.stringify(meta),',
        '    created_at: new Date(),',
        '  })',
        '}',
      ]),
    ],
  }

  return {
    commits,
    frameModel,
    dangerousWindows: [{
      openAtCommit:   0,
      closedAtCommit: 1,
      description: 'JWT auth added without role check — all authenticated users had full access between commits 1 and 2.',
    }],
    commitRiskScores: [82, 71, 38],
    truncated:    false,
    totalCommits: 3,
    tier:         'free',
  }
})()
