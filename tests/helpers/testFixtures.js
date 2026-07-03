// Known PR fixtures for deterministic integration tests.
// All values are hand-computed so tests never depend on network.

export const FIXTURE_COMMITS = [
  {
    sha: 'aaa0001',
    commit: {
      message: 'chore: project scaffold',
      author: { name: 'neil.runde', date: '2024-01-15T09:14:00Z' },
    },
    files: [
      { filename: 'src/app.js',              additions: 6,  deletions: 0, patch: '@@ -0,0 +1,6 @@\n+const express = require(\'express\')\n+const app = express()\n+app.use(express.json())\n+module.exports = app' },
      { filename: 'src/config/settings.js',  additions: 3,  deletions: 0, patch: '@@ -0,0 +1,3 @@\n+module.exports = { port: 3000, env: process.env.NODE_ENV }' },
    ],
  },
  {
    sha: 'bbb0002',
    commit: {
      message: 'feat(auth): JWT verification middleware',
      author: { name: 'neil.runde', date: '2024-01-15T10:33:00Z' },
    },
    files: [
      { filename: 'src/auth/middleware.js',  additions: 14, deletions: 0, patch: '@@ -0,0 +1,14 @@\n+const jwt = require(\'jsonwebtoken\')\n+const verifyToken = (req, res, next) => {\n+  const header = req.headers[\'authorization\']\n+  if (!header) return res.status(401).json({ error: \'No token\' })\n+  const token = header.split(\' \')[1]\n+  try {\n+    req.user = jwt.verify(token, process.env.JWT_SECRET)\n+    next()\n+  } catch (err) {\n+    res.status(403).json({ error: \'Invalid token\' })\n+  }\n+}\n+module.exports = { verifyToken }' },
    ],
  },
  {
    sha: 'ccc0003',
    commit: {
      message: 'feat(auth): role-based access control',
      author: { name: 'neil.runde', date: '2024-01-15T11:57:00Z' },
    },
    files: [
      { filename: 'src/auth/middleware.js',  additions: 9,  deletions: 2, patch: '@@ -11,2 +11,9 @@\n-module.exports = { verifyToken }\n+const requireRole = (...roles) => (req, res, next) => {\n+  if (!req.user) return res.status(401).json({ error: \'Unauthenticated\' })\n+  if (!roles.includes(req.user.role)) return res.status(403).json({ error: \'Forbidden\' })\n+  next()\n+}\n+module.exports = { verifyToken, requireRole }' },
    ],
  },
]

// Pre-computed risk scores for FIXTURE_COMMITS
// src/auth/middleware.js matches the /auth/ pattern → weight = 2.0 (FILE_WEIGHTS.auth)
// linesChanged=14, complexityDelta=0, churn=0
// size = min(14/50, 1) * 40 = 11.2 → round(11.2 * 2.0) = 22
export const FIXTURE_COMMIT_2_AUTH_SCORE_MIN = 15   // at least this
export const FIXTURE_COMMIT_2_AUTH_SCORE_MAX = 40   // at most this

// Fixture with no files (edge case)
export const FIXTURE_EMPTY_COMMIT = {
  sha: 'empty001',
  commit: { message: 'empty', author: { name: 'test', date: '2024-01-01T00:00:00Z' } },
  files: [],
}

// Fixture for dangerous window: commit A adds auth, commit B adds guard
export const FIXTURE_DW_COMMITS = [
  { files: [{ patch: '+req.user = jwt.verify(token, secret)' }] },
  { files: [{ patch: '+if (!requireRole(req)) return 403' }] },
]

// Fixture for no dangerous window (auth + guard in same commit)
export const FIXTURE_NO_DW_COMMITS = [
  { files: [{ patch: '+req.user = jwt.verify(token, secret)\n+if (!requireRole(req)) return 403' }] },
]
