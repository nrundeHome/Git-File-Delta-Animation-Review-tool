// Mock helpers for GitHub API and Chrome extension APIs.
// Use these in integration tests to avoid real network calls.

import { vi } from 'vitest'

/**
 * Create a mock fetch that returns canned GitHub API responses.
 * Call setup() before tests, teardown() after.
 */
export function createMockFetch(responses = {}) {
  const mockFetch = vi.fn(async (url) => {
    // Find matching response by URL substring
    const key = Object.keys(responses).find(k => url.includes(k))
    if (!key) {
      return { ok: false, status: 404, statusText: 'Not Found',
               json: async () => ({ message: 'Not Found' }),
               headers: { get: () => null } }
    }
    const body = responses[key]
    return {
      ok: true, status: 200, statusText: 'OK',
      json: async () => body,
      headers: { get: (h) => h === 'x-ratelimit-remaining' ? '4999' : null },
    }
  })
  return mockFetch
}

/**
 * Create a mock chrome.storage.local.
 * Keeps data in a plain object — get/set work synchronously under the hood.
 */
export function createMockStorage(initial = {}) {
  const store = { ...initial }
  return {
    local: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') return { [keys]: store[keys] }
        if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]))
        // object form: keys are defaults
        const result = {}
        for (const k of Object.keys(keys)) result[k] = store[k] ?? keys[k]
        return result
      }),
      set: vi.fn(async (obj) => { Object.assign(store, obj) }),
      remove: vi.fn(async (keys) => {
        const ks = Array.isArray(keys) ? keys : [keys]
        ks.forEach(k => delete store[k])
      }),
    },
    _store: store,  // direct access for assertions
  }
}

/**
 * Install mock chrome global in test environment.
 * Call in beforeEach, clean up in afterEach.
 */
export function installChromeMock(storage = createMockStorage()) {
  global.chrome = {
    storage,
    runtime: {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      lastError: null,
    },
  }
  return global.chrome
}

export function uninstallChromeMock() {
  delete global.chrome
}
