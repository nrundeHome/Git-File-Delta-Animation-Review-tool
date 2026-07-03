#!/usr/bin/env node
/**
 * scripts/health.js — Check that dev server and mock API are up
 *
 * Usage: node scripts/health.js
 * Exit 0 = all services healthy. Exit 1 = one or more down.
 */

const CHECKS = [
  { name: 'Vite dev server', url: 'http://localhost:5173', required: false },
  { name: 'GitHub mock API',  url: 'http://localhost:3001/user', required: false },
]

async function check({ name, url, required }) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    console.warn(`[health] ✓ ${name} — ${url} (${res.status})`)
    return true
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'timeout' : err.message
    const icon = required ? '✖' : '○'
    console.warn(`[health] ${icon} ${name} — ${url} (${msg})`)
    return !required
  }
}

const results = await Promise.all(CHECKS.map(check))
const allOk   = results.every(Boolean)

if (allOk) {
  console.warn('[health] All services healthy')
} else {
  console.warn('[health] One or more required services are down')
  console.warn('  Start dev server:  npm run dev')
  console.warn('  Start mock API:    npm run mock-api')
}

process.exit(allOk ? 0 : 1)
