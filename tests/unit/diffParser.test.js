// Unit tests for diffParser.js — dangerous window detection and patch parsing

import { describe, it, expect } from 'vitest'
import { detectDangerousWindows } from '../../src/services/diffParser.js'

// ─── Dangerous window detection ────────────────────────────────────────────

describe('detectDangerousWindows', () => {
  it('returns empty array for a PR with no auth patterns', () => {
    const commits = [
      { files: [{ patch: '+const x = 1\n+const y = 2' }] },
      { files: [{ patch: '+module.exports = { x, y }' }] },
    ]
    expect(detectDangerousWindows(commits)).toHaveLength(0)
  })

  it('detects window when jwt.verify added without requireRole in same commit', () => {
    const commits = [
      // commit 0: JWT added, no guard
      { files: [{ patch: '+req.user = jwt.verify(token, secret)' }] },
      // commit 1: role guard added
      { files: [{ patch: '+if (!requireRole(req, "admin")) return res.status(403).json({})' }] },
    ]
    const windows = detectDangerousWindows(commits)
    expect(windows).toHaveLength(1)
    expect(windows[0].openAtCommit).toBe(0)
    expect(windows[0].closedAtCommit).toBe(1)
  })

  it('no window when auth and guard land in the same commit', () => {
    const commits = [
      {
        files: [{
          patch: '+req.user = jwt.verify(token, secret)\n+if (!requireRole(req)) return 403',
        }],
      },
    ]
    // Auth and guard in same commit — no window
    expect(detectDangerousWindows(commits)).toHaveLength(0)
  })

  it('RULE-06: detects window for multiple auth pattern notations', () => {
    const authVariants = [
      '+req.user = jwt.verify(token, s)',
      '+passport.authenticate("jwt")',
      '+const ok = verifyToken(req)',
      '+if (!req.isAuthenticated()) return',
    ]
    authVariants.forEach(pattern => {
      const commits = [
        { files: [{ patch: pattern }] },
        { files: [{ patch: '+requireRole(req, "admin")' }] },
      ]
      const windows = detectDangerousWindows(commits)
      expect(windows.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('flags unclosed window when PR ends with auth but no guard', () => {
    const commits = [
      { files: [{ patch: '+req.user = jwt.verify(token, secret)' }] },
      { files: [{ patch: '+const rate = rateLimit({ max: 60 })' }] },
    ]
    const windows = detectDangerousWindows(commits)
    expect(windows).toHaveLength(1)
    expect(windows[0].closedAtCommit).toBeNull()  // never closed
  })

  it('handles commits with null/missing patch gracefully', () => {
    const commits = [
      { files: [{ patch: null }, { patch: undefined }] },
      { files: [] },
    ]
    expect(() => detectDangerousWindows(commits)).not.toThrow()
    expect(detectDangerousWindows(commits)).toHaveLength(0)
  })
})
