// Central config — import from here, never hardcode values in src/
// Per ADR-004: PAT stored in chrome.storage.local

export const GITHUB_API_VERSION = '2022-11-28'
export const GITHUB_API_BASE    = 'https://api.github.com'

// Risk threshold breakpoints — mirrored in risk-colors.css CSS tokens
// Thresholds are inclusive lower bounds: score >= HIGH → hi, score >= LOW → md
// Mirrors diffParser.scoreToTier() and CLAUDE.md: 0–33 lo, 34–66 md, 67–100 hi
export const RISK_THRESHOLDS = {
  LOW:  parseInt(import.meta.env?.VITE_RISK_LOW  ?? 34),
  HIGH: parseInt(import.meta.env?.VITE_RISK_HIGH ?? 67),
}

// File type risk weight multipliers — applied to base risk score
// auth/config files get higher multipliers; test files get lower
export const FILE_WEIGHTS = {
  auth:        2.0,
  middleware:  1.8,
  config:      1.6,
  schema:      1.5,
  migration:   1.5,
  test:        0.4,
  spec:        0.4,
  mock:        0.3,
  fixture:     0.3,
  default:     1.0,
}

// Cache TTLs in milliseconds
export const CACHE_TTL = {
  COMMIT_LIST:  30 * 60 * 1000,   // 30 min — PR commit list
  COMMIT_DIFF:   6 * 60 * 60 * 1000,  // 6 hr  — individual commit diff
  FRAME_MODEL:   6 * 60 * 60 * 1000,  // 6 hr  — parsed frame model
  AUTHOR_CHURN: 24 * 60 * 60 * 1000,  // 24 hr — author churn history
  LICENSE:      24 * 60 * 60 * 1000,  // 24 hr — license validation
}

// Free tier limits
export const FREE_TIER = {
  MAX_COMMITS:    5,
  MAX_FILES:      3,
  MAX_PRS_PER_DAY: 3,
}

// License validation endpoint (Cloudflare Worker — Phase 3)
export const LICENSE_ENDPOINT = 'https://license.diffcast.app/validate'
