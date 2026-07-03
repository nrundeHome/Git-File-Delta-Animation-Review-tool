/**
 * tests/unit/background.test.js
 *
 * Unit tests for src/background.js message router.
 *
 * background.js is a side-effect module: when imported it calls
 * chrome.runtime.onMessage.addListener(handler). We capture that handler,
 * then exercise it directly with synthetic messages.
 *
 * All external imports (githubApi, diffParser, riskCalculator) are mocked so
 * tests never hit the network. chrome APIs are stubbed via globalThis.
 *
 * Covered:
 *  - VALIDATE_TOKEN  → delegates to validateGithubToken mock
 *  - SET_TOKEN       → stores token, returns { ok: true }
 *  - GET_TOKEN       → returns stored token (or null)
 *  - CHECK_LICENSE   → delegates to validateLicense mock
 *  - GET_TIER        → { tier: 'free' } when no license in storage
 *  - GET_TIER        → { tier: 'pro' } when valid cached license
 *  - LOAD_PR prNumber=0 → returns built-in MOCK_PR_DATA (dev mode)
 *  - Unknown type    → returns { error: 'Unknown message type: ...' }
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'

// ─── Mock all background.js dependencies (vi.mock is hoisted by Vitest) ──────

vi.mock('../../src/services/githubApi.js', () => ({
  getPRCommits:        vi.fn().mockResolvedValue([]),
  getCommitFiles:      vi.fn().mockResolvedValue({ sha: 'abc', files: [] }),
  getAuthorChurn:      vi.fn().mockResolvedValue(0),
  validateLicense:     vi.fn().mockResolvedValue({ valid: true, tier: 'pro', seats: 1 }),
  validateGithubToken: vi.fn().mockResolvedValue({ ok: true, login: 'mock-user' }),
}))

vi.mock('../../src/services/diffParser.js', () => ({
  buildFrameModel:        vi.fn().mockReturnValue(new Map()),
  detectDangerousWindows: vi.fn().mockReturnValue([]),
}))

vi.mock('../../src/utils/riskCalculator.js', () => ({
  commitRiskScore: vi.fn().mockReturnValue(50),
  fileTypeWeight:  vi.fn().mockReturnValue(1.0),
  riskScore:       vi.fn().mockReturnValue(50),
}))

// ─── Chrome API stub ──────────────────────────────────────────────────────────

// Set up chrome global at module scope so it is in place when background.js
// is dynamically imported in beforeAll (module-level code runs first).

let capturedHandler = null
const storageData   = {}

globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: (fn) => { capturedHandler = fn },
    },
  },
  storage: {
    local: {
      get:  vi.fn(async (key)   => ({ [key]: storageData[key] })),
      set:  vi.fn(async (patch) => { Object.assign(storageData, patch) }),
    },
  },
}

// ─── Load module under test ───────────────────────────────────────────────────

beforeAll(async () => {
  // Dynamic import ensures chrome global is ready before background.js registers its listener
  vi.resetModules()
  await import('../../src/background.js')
})

// ─── Test helper ──────────────────────────────────────────────────────────────

/**
 * Send a synthetic message through the captured handler.
 * Mirrors how chrome.runtime.onMessage works: the handler is called with
 * (msg, sender, sendResponse) and returns true (async).
 */
function send(msg) {
  return new Promise((resolve) => {
    capturedHandler(msg, {}, resolve)
  })
}

// ─── Message routing ──────────────────────────────────────────────────────────

describe('VALIDATE_TOKEN', () => {
  it('delegates to validateGithubToken and returns its result', async () => {
    const { validateGithubToken } = await import('../../src/services/githubApi.js')
    validateGithubToken.mockResolvedValueOnce({ ok: true, login: 'alice' })

    const result = await send({ type: 'VALIDATE_TOKEN', token: 'ghp_abc' })
    expect(result).toEqual({ ok: true, login: 'alice' })
    expect(validateGithubToken).toHaveBeenCalledWith('ghp_abc')
  })
})

describe('SET_TOKEN / GET_TOKEN', () => {
  it('SET_TOKEN stores the token and returns { ok: true }', async () => {
    const result = await send({ type: 'SET_TOKEN', token: 'ghp_stored' })
    expect(result).toEqual({ ok: true })
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ github_token: 'ghp_stored' })
    )
  })

  it('GET_TOKEN returns the stored token', async () => {
    storageData['github_token'] = 'ghp_stored'
    const result = await send({ type: 'GET_TOKEN' })
    expect(result).toEqual({ token: 'ghp_stored' })
  })

  it('GET_TOKEN returns { token: null } when no token is set', async () => {
    delete storageData['github_token']
    const result = await send({ type: 'GET_TOKEN' })
    expect(result).toEqual({ token: null })
  })
})

describe('CHECK_LICENSE', () => {
  it('delegates to validateLicense and caches the result', async () => {
    const { validateLicense } = await import('../../src/services/githubApi.js')
    validateLicense.mockResolvedValueOnce({ valid: true, tier: 'pro', seats: 1 })

    const result = await send({ type: 'CHECK_LICENSE', key: 'PRO-KEY-123' })
    expect(result.valid).toBe(true)
    expect(result.tier).toBe('pro')
    // Must cache the result in storage
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        license: expect.objectContaining({ tier: 'pro', key: 'PRO-KEY-123' }),
      })
    )
  })
})

describe('GET_TIER', () => {
  it('returns { tier: "free" } when no license is in storage', async () => {
    delete storageData['license']
    const result = await send({ type: 'GET_TIER' })
    expect(result).toEqual({ tier: 'free' })
  })

  it('returns cached tier when license is fresh', async () => {
    storageData['license'] = {
      key:      'PRO-KEY',
      valid:    true,
      tier:     'pro',
      seats:    5,
      cachedAt: Date.now(),
    }
    const result = await send({ type: 'GET_TIER' })
    expect(result.tier).toBe('pro')
    expect(result.seats).toBe(5)
  })
})

describe('LOAD_PR — dev mode', () => {
  it('returns built-in MOCK_PR_DATA when prNumber is 0 (no token required)', async () => {
    delete storageData['github_token']
    const result = await send({ type: 'LOAD_PR', owner: 'o', repo: 'r', prNumber: 0 })
    // MOCK_PR_DATA has 3 commits and a frameModel
    expect(Array.isArray(result.commits)).toBe(true)
    expect(result.commits.length).toBe(3)
    expect(typeof result.frameModel).toBe('object')
  })
})

describe('unknown message type', () => {
  it('returns { error: "Unknown message type: ..." } for an unrecognised type', async () => {
    const result = await send({ type: 'NO_SUCH_MESSAGE' })
    expect(result.error).toMatch(/Unknown message type: NO_SUCH_MESSAGE/)
  })
})
