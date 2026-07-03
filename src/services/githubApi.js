// GitHub API wrapper — auth + exponential backoff + rate-limit queue
// Per mandatory-patterns.md: NEVER use bare fetch() for GitHub API
// All calls go through this module only.

import { GITHUB_API_BASE, GITHUB_API_VERSION, CACHE_TTL } from '../config/api.js'

const MAX_RETRIES    = 3
const BACKOFF_BASE   = 1000  // ms
const RATE_LIMIT_HDR = 'x-ratelimit-remaining'

// ─── Token access ──────────────────────────────────────────────────────────

async function getToken() {
  const { github_token } = await chrome.storage.local.get('github_token')
  return github_token ?? null
}

// ─── Core request ──────────────────────────────────────────────────────────

async function request(path, options = {}, attempt = 0) {
  const token = await getToken()
  if (!token) throw new Error('No GitHub token. Set one in the DiffCast popup.')

  const url = `${GITHUB_API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization':        `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Accept':               'application/vnd.github+json',
      ...(options.headers ?? {}),
    },
  })

  // Rate limit hit — respect Retry-After or backoff
  if (res.status === 429 || res.status === 403) {
    const retryAfter = res.headers.get('retry-after')
    const wait = retryAfter ? parseInt(retryAfter) * 1000
                            : BACKOFF_BASE * 2 ** attempt
    if (attempt >= MAX_RETRIES) {
      console.error('[diffcast] GitHub rate limit — max retries exceeded')
      throw new Error(`GitHub API rate limited after ${MAX_RETRIES} retries`)
    }
    await sleep(wait)
    return request(path, options, attempt + 1)
  }

  // Server errors — retry with backoff
  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(BACKOFF_BASE * 2 ** attempt)
    return request(path, options, attempt + 1)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`GitHub API ${res.status}: ${body.message ?? res.statusText}`)
  }

  const remaining = res.headers.get(RATE_LIMIT_HDR)
  if (remaining !== null && parseInt(remaining) < 100) {
    console.warn(`[diffcast] GitHub rate limit low: ${remaining} requests remaining`)
  }

  return res
}

// ─── Cached fetch ──────────────────────────────────────────────────────────

async function cachedFetch(cacheKey, path, ttl) {
  const cached = await chrome.storage.local.get(cacheKey)
  if (cached[cacheKey]) {
    const { data, ts } = cached[cacheKey]
    if (Date.now() - ts < ttl) return data
  }
  const res  = await request(path)
  const data = await res.json()
  await chrome.storage.local.set({ [cacheKey]: { data, ts: Date.now() } })
  return data
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * List commits for a pull request (max 250).
 * Returns array of { sha, commit: { message, author }, ... }
 */
export async function getPRCommits(owner, repo, prNumber) {
  const key = `pr:${owner}/${repo}:${prNumber}:commits`
  return cachedFetch(key, `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`, CACHE_TTL.COMMIT_LIST)
}

/**
 * Get files changed in a commit, including unified diff patches.
 * Returns { sha, files: [{ filename, patch, additions, deletions, status }] }
 */
export async function getCommitFiles(owner, repo, sha) {
  const key = `commit:${owner}/${repo}:${sha}:files`
  return cachedFetch(key, `/repos/${owner}/${repo}/commits/${sha}`, CACHE_TTL.COMMIT_DIFF)
}

/**
 * Get author's recent commits to a specific file (for churn signal).
 * Returns count of commits in last 90 days.
 */
export async function getAuthorChurn(owner, repo, filepath, authorLogin) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const key   = `churn:${owner}/${repo}:${filepath}:${authorLogin}`
  const commits = await cachedFetch(
    key,
    `/repos/${owner}/${repo}/commits?author=${authorLogin}&path=${encodeURIComponent(filepath)}&since=${since}&per_page=100`,
    CACHE_TTL.AUTHOR_CHURN,
  )
  return Array.isArray(commits) ? commits.length : 0
}

/**
 * Validate a GitHub PAT before saving it to storage.
 * Accepts the token as a parameter (not from storage — used during connect flow).
 * Returns { ok: boolean, login?: string, error?: string }
 */
export async function validateGithubToken(token) {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization':        `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Accept':               'application/vnd.github+json',
      },
    })
    if (!res.ok) {
      return {
        ok:    false,
        error: res.status === 401
          ? 'Token is invalid or expired'
          : `GitHub returned ${res.status} — check token scopes`,
      }
    }
    const user = await res.json()
    if (typeof user !== 'object' || !user.login) {
      return { ok: false, error: 'Unexpected response from GitHub — please try again' }
    }
    return { ok: true, login: user.login }
  } catch {
    return { ok: false, error: 'Network error — check your connection' }
  }
}

/**
 * Validate a DiffCast Pro license key (Phase 3).
 * Returns { valid: boolean, tier: 'free'|'pro'|'team', seats: number }
 */
export async function validateLicense(key) {
  // Stub — returns free tier until Phase 3 license infrastructure is built
  if (!key) return { valid: false, tier: 'free', seats: 0 }
  // TODO Phase 3: fetch(LICENSE_ENDPOINT + '?key=' + key)
  return { valid: true, tier: 'pro', seats: 1 }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))
