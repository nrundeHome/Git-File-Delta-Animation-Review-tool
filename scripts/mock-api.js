#!/usr/bin/env node
/**
 * scripts/mock-api.js — GitHub API mock server for integration tests
 *
 * Serves fixture PR data on http://localhost:3001
 * Required by: npm run test:integration (when testing against HTTP, not in-process mocks)
 *
 * Usage: node scripts/mock-api.js
 * Stop:  Ctrl-C
 *
 * Endpoints mirrored from src/services/githubApi.js:
 *   GET /repos/:owner/:repo/pulls/:pr/commits
 *   GET /repos/:owner/:repo/commits/:sha
 *   GET /repos/:owner/:repo/commits?path=:filepath&author=:login
 */

import { createServer } from 'http'

const PORT = process.env.MOCK_API_PORT || 3001

// ─── Fixture data ────────────────────────────────────────────────────────────
// Mirrors tests/helpers/testFixtures.js — kept in sync manually

const FIXTURE_COMMITS = [
  {
    sha: 'aaa0001',
    commit: {
      message: 'feat(auth): add JWT validation middleware',
      author: { name: 'alice', date: '2026-06-01T10:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename: 'src/auth/middleware.js',
        additions: 42, deletions: 0, changes: 42,
        patch: [
          '@@ -0,0 +1,10 @@',
          '+const jwt = require(\'jsonwebtoken\')',
          '+',
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
    sha: 'bbb0002',
    commit: {
      message: 'feat(auth): add role-based access control',
      author: { name: 'alice', date: '2026-06-01T11:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename: 'src/auth/rbac.js',
        additions: 28, deletions: 0, changes: 28,
        patch: [
          '@@ -0,0 +1,8 @@',
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
    sha: 'ccc0003',
    commit: {
      message: 'test(auth): add middleware unit tests',
      author: { name: 'alice', date: '2026-06-01T12:00:00Z' },
    },
    author: { login: 'alice' },
    files: [
      {
        filename: 'tests/auth/middleware.test.js',
        additions: 35, deletions: 0, changes: 35,
        patch: '@@ -0,0 +1,10 @@\n+describe(\'verifyToken\', () => {\n+  it(\'rejects missing token\', () => {})\n+})\n',
      },
    ],
  },
]

// Commit detail map for /commits/:sha endpoint
const COMMIT_MAP = Object.fromEntries(FIXTURE_COMMITS.map(c => [c.sha, c]))

// Churn data: number of commits in last 90 days per author/file
const CHURN_MAP = {
  'alice:src/auth/middleware.js': 7,
  'alice:src/auth/rbac.js':       3,
  'alice:tests/auth/middleware.test.js': 2,
}

// ─── Router ──────────────────────────────────────────────────────────────────

function route(req) {
  const url  = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const m    = (re) => path.match(re)
  let match

  // GET /repos/:owner/:repo/pulls/:pr/commits
  if ((match = m(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/commits/))) {
    return { status: 200, body: FIXTURE_COMMITS.map(c => ({ sha: c.sha, commit: c.commit, author: c.author })) }
  }

  // GET /repos/:owner/:repo/commits/:sha
  if ((match = m(/^\/repos\/([^/]+)\/([^/]+)\/commits\/([a-f0-9]+)$/))) {
    const sha = match[3]
    const commit = COMMIT_MAP[sha]
    if (!commit) return { status: 404, body: { message: `Commit ${sha} not found in fixture` } }
    return { status: 200, body: commit }
  }

  // GET /repos/:owner/:repo/commits?path=:filepath&author=:login (churn)
  if ((match = m(/^\/repos\/([^/]+)\/([^/]+)\/commits$/))) {
    const filepath = url.searchParams.get('path') || ''
    const author   = url.searchParams.get('author') || ''
    const key      = `${author}:${filepath}`
    const count    = CHURN_MAP[key] ?? 0
    // Return an array of count stub commits (caller only needs .length)
    return { status: 200, body: Array.from({ length: count }, (_, i) => ({ sha: `churn${i}` })) }
  }

  // GET /repos/:owner/:repo/pulls/:pr (PR metadata)
  if ((match = m(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/))) {
    return {
      status: 200,
      body: {
        number: parseInt(match[3]),
        title: 'feat(auth): JWT + RBAC implementation',
        state: 'open',
        user: { login: 'alice' },
        base: { ref: 'main' },
        head: { ref: 'feat/auth-jwt-rbac', sha: 'ccc0003' },
      },
    }
  }

  // GET /user (token validation — used by popup.js)
  if (path === '/user') {
    return { status: 200, body: { login: 'test-user', id: 1, type: 'User' } }
  }

  return { status: 404, body: { message: `No fixture for ${path}` } }
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const { status, body } = route(req)
  const json = JSON.stringify(body)

  res.writeHead(status, {
    'Content-Type':    'application/json',
    'Content-Length':  Buffer.byteLength(json),
    'X-GitHub-Api-Version': '2022-11-28',
    'X-RateLimit-Remaining': '4999',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(json)

  console.warn(`[mock-api] ${req.method} ${req.url} → ${status}`)
})

server.listen(PORT, () => {
  console.warn(`[mock-api] GitHub API mock listening on http://localhost:${PORT}`)
  console.warn('[mock-api] Serving fixture: 3-commit JWT+RBAC PR (alice)')
  console.warn('[mock-api] Stop with Ctrl-C')
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[mock-api] Port ${PORT} already in use — is another instance running?`)
    process.exit(1)
  }
  throw err
})
