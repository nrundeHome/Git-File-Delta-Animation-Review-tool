/**
 * tests/unit/githubApi.test.js
 *
 * Unit tests for src/services/githubApi.js:
 *  - validateGithubToken: 200, 401, 403, network error
 *  - cachedFetch: cache hit (no network call), cache miss (fetches + stores)
 *  - request retry: 429 rate limit retries with backoff, 5xx retries
 *  - request errors: non-retryable 4xx throws with message
 *  - rate limit low warning (x-ratelimit-remaining < 100)
 *  - validateLicense stub (Phase 3 placeholder)
 *
 * chrome.storage.local and global fetch are stubbed per test.
 * vi.useFakeTimers() handles the sleep() backoff without real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Chrome storage stub ──────────────────────────────────────────────────────

const storage = {}
const chromeMock = {
  storage: {
    local: {
      get:  vi.fn(async (key)   => ({ [key]: storage[key] })),
      set:  vi.fn(async (patch) => { Object.assign(storage, patch) }),
    },
  },
}

globalThis.chrome = chromeMock

// ─── Import after globals ─────────────────────────────────────────────────────

const {
  validateGithubToken,
  validateLicense,
  getPRCommits,
  getCommitFiles,
  getAuthorChurn,
} = await import('../../src/services/githubApi.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal fetch Response mock */
function mockResponse({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json:    async () => json,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  }
}

beforeEach(() => {
  // Clear storage and reset mocks between tests
  Object.keys(storage).forEach(k => delete storage[k])
  chromeMock.storage.local.get.mockClear()
  chromeMock.storage.local.set.mockClear()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── validateGithubToken ──────────────────────────────────────────────────────

describe('validateGithubToken', () => {
  it('returns { ok: true, login } on a successful 200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ json: { login: 'alice' } })
    )
    const result = await validateGithubToken('ghp_valid')
    expect(result).toEqual({ ok: true, login: 'alice' })
  })

  it('sends the token in the Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ json: { login: 'alice' } })
    )
    await validateGithubToken('ghp_mytoken')
    const [, { headers }] = globalThis.fetch.mock.calls[0]
    expect(headers['Authorization']).toBe('Bearer ghp_mytoken')
  })

  it('returns { ok: false, error } on a 401 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 401 })
    )
    const result = await validateGithubToken('ghp_bad')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/invalid or expired/i)
  })

  it('returns { ok: false, error } mentioning scopes on a 403 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 403 })
    )
    const result = await validateGithubToken('ghp_limited')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/403/i)
  })

  it('returns { ok: false, error } when response body lacks login', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ json: { message: 'not a user object' } })
    )
    const result = await validateGithubToken('ghp_weird')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unexpected response/i)
  })

  it('returns { ok: false, error } on a network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await validateGithubToken('ghp_offline')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/network error/i)
  })
})

// ─── validateLicense (Phase 3 stub) ──────────────────────────────────────────

describe('validateLicense', () => {
  it('returns free tier when no key is provided', async () => {
    const result = await validateLicense(null)
    expect(result).toEqual({ valid: false, tier: 'free', seats: 0 })
  })

  it('returns pro tier for any non-empty key (stub behaviour)', async () => {
    const result = await validateLicense('LICENSE-KEY-123')
    expect(result.valid).toBe(true)
    expect(result.tier).toBe('pro')
  })
})

// ─── cachedFetch (via getPRCommits) ──────────────────────────────────────────

describe('cachedFetch', () => {
  beforeEach(() => {
    // Seed a valid token so request() doesn't throw
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('returns cached data without hitting the network on a cache hit', async () => {
    const cachedPayload = [{ sha: 'abc123', commit: { message: 'cached' } }]
    const cacheKey = 'pr:owner/repo:1:commits'
    storage[cacheKey] = { data: cachedPayload, ts: Date.now() }

    chromeMock.storage.local.get.mockImplementation(async (key) => ({
      [key]: storage[key],
    }))

    const result = await getPRCommits('owner', 'repo', 1)
    expect(result).toEqual(cachedPayload)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetches from network and caches result on a cache miss', async () => {
    const apiPayload = [{ sha: 'live001', commit: { message: 'live data' } }]
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: apiPayload,
        headers: { 'x-ratelimit-remaining': '500' },
      })
    )

    const result = await getPRCommits('owner', 'repo', 42)
    expect(result).toEqual(apiPayload)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    // Cache should have been written
    expect(chromeMock.storage.local.set).toHaveBeenCalled()
    const [stored] = chromeMock.storage.local.set.mock.calls[0]
    const key = Object.keys(stored)[0]
    expect(stored[key].data).toEqual(apiPayload)
  })

  it('re-fetches after TTL expires', async () => {
    const stalePayload = [{ sha: 'stale' }]
    const freshPayload = [{ sha: 'fresh' }]
    const cacheKey     = 'pr:owner/repo:99:commits'

    // Store expired entry (ts = 0 → expired against any real TTL)
    storage[cacheKey]       = { data: stalePayload, ts: 0 }
    storage['github_token'] = 'ghp_test'

    chromeMock.storage.local.get.mockImplementation(async (key) => ({
      [key]: storage[key],
    }))

    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: freshPayload,
        headers: { 'x-ratelimit-remaining': '999' },
      })
    )

    const result = await getPRCommits('owner', 'repo', 99)
    expect(result).toEqual(freshPayload)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })
})

// ─── request: rate limit (429) retries ───────────────────────────────────────

describe('request retry on 429', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('retries on 429 and succeeds on the next attempt', async () => {
    const successPayload = [{ sha: 'ok' }]
    let call = 0
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call++
      if (call === 1) {
        return mockResponse({ ok: false, status: 429, headers: { 'retry-after': '1' } })
      }
      return mockResponse({ json: successPayload, headers: { 'x-ratelimit-remaining': '200' } })
    })

    const promise = getPRCommits('owner', 'repo', 1)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual(successPayload)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after MAX_RETRIES (3) rate-limit responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 429, headers: { 'retry-after': '1' } })
    )

    // Attach the rejection handler BEFORE running timers to avoid
    // PromiseRejectionHandledWarning (rejection must be handled synchronously).
    const assertion = expect(getPRCommits('owner', 'repo', 1)).rejects.toThrow(/rate limited after 3 retries/)
    await vi.runAllTimersAsync()
    await assertion
  })
})

// ─── request retry on 5xx ────────────────────────────────────────────────────

describe('request retry on 5xx', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('retries on 500 and succeeds on next attempt', async () => {
    const successPayload = [{ sha: 'recovered' }]
    let call = 0
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call++
      if (call === 1) return mockResponse({ ok: false, status: 500 })
      return mockResponse({ json: successPayload, headers: { 'x-ratelimit-remaining': '200' } })
    })

    const promise = getPRCommits('owner', 'repo', 1)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toEqual(successPayload)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})

// ─── request: non-retryable 4xx throws ───────────────────────────────────────

describe('request non-retryable errors', () => {
  beforeEach(() => {
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('throws immediately on 404 with GitHub error message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 404, json: { message: 'Not Found' } })
    )
    await expect(getCommitFiles('owner', 'repo', 'deadbeef')).rejects.toThrow('GitHub API 404: Not Found')
  })

  it('throws when no token is set', async () => {
    delete storage['github_token']
    await expect(getPRCommits('owner', 'repo', 1)).rejects.toThrow(/No GitHub token/)
  })
})

// ─── rate limit low warning ───────────────────────────────────────────────────

describe('rate limit low warning', () => {
  beforeEach(() => {
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('emits console.warn when x-ratelimit-remaining drops below 100', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: [{ sha: 'abc' }],
        headers: { 'x-ratelimit-remaining': '50' },
      })
    )

    await getPRCommits('owner', 'repo', 1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rate limit low'))
    warnSpy.mockRestore()
  })

  it('does not warn when x-ratelimit-remaining is 100 or above', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: [{ sha: 'abc' }],
        headers: { 'x-ratelimit-remaining': '100' },
      })
    )

    await getPRCommits('owner', 'repo', 1)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ─── getAuthorChurn ───────────────────────────────────────────────────────────

describe('getAuthorChurn', () => {
  beforeEach(() => {
    storage['github_token'] = 'ghp_test'
    chromeMock.storage.local.get.mockImplementation(async (key) => ({ [key]: storage[key] }))
  })

  it('returns the count of commits in the response array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: [{ sha: '1' }, { sha: '2' }, { sha: '3' }],
        headers: { 'x-ratelimit-remaining': '500' },
      })
    )
    const churn = await getAuthorChurn('owner', 'repo', 'src/auth.js', 'alice')
    expect(churn).toBe(3)
  })

  it('returns 0 when the API returns a non-array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        json: { message: 'validation failed' },
        headers: { 'x-ratelimit-remaining': '500' },
      })
    )
    const churn = await getAuthorChurn('owner', 'repo', 'src/auth.js', 'alice')
    expect(churn).toBe(0)
  })
})
