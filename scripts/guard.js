#!/usr/bin/env node
/**
 * scripts/guard.js — Anti-pattern scanner for DiffCast source code
 *
 * Checks src/ and tests/ against RECURRING-PATTERNS.md and mandatory-patterns.md.
 * Exit 0 = clean. Exit 1 = blocking violations found.
 *
 * Usage:
 *   node scripts/guard.js           # scan only
 *   node scripts/guard.js --fix     # auto-fix safe violations (LOG-001 only)
 *   node scripts/guard.js --file src/popup/popup.js   # single file
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, relative, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dirname, '..')
const SRC   = join(ROOT, 'src')
const TESTS = join(ROOT, 'tests')

const FIX_MODE  = process.argv.includes('--fix')
const fileArg   = process.argv.find((a, i) => process.argv[i - 1] === '--file')

// ─── helpers ────────────────────────────────────────────────────────────────

function walkFiles(dir, exts = ['.js', '.css', '.html']) {
  if (!existsSync(dir)) return []
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkFiles(full, exts))
    else if (exts.includes(extname(entry.name))) results.push(full)
  }
  return results
}

function rel(f) { return relative(ROOT, f) }

const violations = []  // critical | high — block commit
const warnings   = []  // medium | low — advisory

function report(id, severity, file, line, message) {
  const entry = { id, severity, file: rel(file), line, message }
  if (severity === 'critical' || severity === 'high') violations.push(entry)
  else warnings.push(entry)
}

// ─── file sets ──────────────────────────────────────────────────────────────

const srcJs    = fileArg ? [fileArg] : walkFiles(SRC, ['.js'])
const testJs   = fileArg ? []        : walkFiles(TESTS, ['.js'])
const allCss   = fileArg ? []        : walkFiles(SRC, ['.css'])

// ─── ANIM-001 ───────────────────────────────────────────────────────────────
// requestAnimationFrame in a file must have console.warn FPS logging

for (const file of srcJs) {
  const src = readFileSync(file, 'utf8')
  if (src.includes('requestAnimationFrame') && !src.includes('console.warn')) {
    report('ANIM-001', 'high', file, 1,
      'requestAnimationFrame loop missing FPS jank logging — add console.warn for frames > 50ms')
  }
}

// ─── WCAG-001 ───────────────────────────────────────────────────────────────
// requestAnimationFrame in a file must also check prefers-reduced-motion

for (const file of srcJs) {
  const src = readFileSync(file, 'utf8')
  if (src.includes('requestAnimationFrame') && !src.includes('prefers-reduced-motion')) {
    report('WCAG-001', 'critical', file, 1,
      'requestAnimationFrame without prefers-reduced-motion check — add media query guard')
  }
}

// ─── API-001 ────────────────────────────────────────────────────────────────
// GitHub API version hardcoded (must import from src/config/api.js)

const API_DATE_RE = /['"`](20\d{2}-\d{2}-\d{2})['"`]/g
for (const file of srcJs) {
  if (file.endsWith(join('config', 'api.js'))) continue  // canonical — allowed
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    API_DATE_RE.lastIndex = 0
    if (API_DATE_RE.test(line)) {
      report('API-001', 'high', file, i + 1,
        `Hardcoded GitHub API date version on line ${i + 1}: ${line.trim()}`)
    }
  })
}

// ─── BARE-FETCH ─────────────────────────────────────────────────────────────
// Direct fetch() to api.github.com is forbidden — must use githubApi() wrapper

const BARE_FETCH_RE = /fetch\s*\(\s*['"`]https:\/\/api\.github\.com/
for (const file of srcJs) {
  if (file.endsWith('githubApi.js')) continue  // the wrapper itself — allowed
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (BARE_FETCH_RE.test(line)) {
      report('API-001', 'high', file, i + 1,
        `Bare fetch() to api.github.com on line ${i + 1} — use githubApi() wrapper`)
    }
  })
}

// ─── LOG-001 ────────────────────────────────────────────────────────────────
// console.log is forbidden in committed src/ code unless followed by // keep

const LOG_RE  = /\bconsole\.log\s*\(/
const KEEP_RE = /\/\/\s*keep/i
for (const file of srcJs) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const fixedLines = [...lines]
  let changed = false

  lines.forEach((line, i) => {
    if (LOG_RE.test(line) && !KEEP_RE.test(line)) {
      if (FIX_MODE) {
        fixedLines[i] = line.replace(LOG_RE, '// [guard:removed] console.log(')
        changed = true
      }
      report('LOG-001', 'high', file, i + 1,
        `Bare console.log on line ${i + 1} — use console.warn/error or add // keep`)
    }
  })

  if (FIX_MODE && changed) {
    writeFileSync(file, fixedLines.join('\n'), 'utf8')
    console.warn(`[guard:fix] LOG-001 auto-fixed in ${rel(file)}`)
  }
}

// ─── RISK-001 ───────────────────────────────────────────────────────────────
// Risk color hex values must live in risk-colors.css — never hardcoded in JS

const RISK_HEX = ['#cf222e', '#9a6700', '#1a7f37', '#f85149', '#d4a017', '#3fb950',
                  '#CF222E', '#9A6700', '#1A7F37', '#F85149', '#D4A017', '#3FB950']

for (const file of srcJs) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const hex of RISK_HEX) {
      if (line.includes(hex)) {
        report('RISK-001', 'critical', file, i + 1,
          `Risk color ${hex} hardcoded in JS on line ${i + 1} — must use CSS variable from risk-colors.css`)
        break
      }
    }
  })
}

// ─── CODE-001 ───────────────────────────────────────────────────────────────
// classList.contains in tests must be accompanied by data-testid usage

const CLASSLIST_RE = /classList\.contains\s*\(/
const TESTID_RE    = /data-testid/
for (const file of testJs) {
  const src = readFileSync(file, 'utf8')
  if (CLASSLIST_RE.test(src) && !TESTID_RE.test(src)) {
    report('CODE-001', 'high', file, 1,
      'classList.contains in tests without data-testid — add data-testid or cite source file in comment')
  }
}

// ─── TEST-001 ───────────────────────────────────────────────────────────────
// Test fixture diffs should stay under 50 lines to avoid timeouts

for (const file of testJs) {
  const src = readFileSync(file, 'utf8')
  // Count lines that look like inline diff content (strings starting with + or -)
  const inlineDiffLines = (src.match(/['"]\s*[+\-][^'"]{2,}/g) || []).length
  if (inlineDiffLines > 50) {
    report('TEST-001', 'medium', file, 1,
      `${inlineDiffLines} inline diff lines in fixture — keep under 50 to avoid test timeouts`)
  }
}

// ─── LOOP-001 ───────────────────────────────────────────────────────────────
// [loop] commits must be reviewed in memory/ before merging

try {
  const gitLog = execSync('git log --format="%H %s" 2>/dev/null', { cwd: ROOT }).toString()
  const loopCommits = gitLog.split('\n')
    .filter(l => l.includes('[loop]'))
    .map(l => ({ hash: l.split(' ')[0], subject: l.slice(l.indexOf(' ') + 1) }))
    .filter(c => c.hash)

  if (loopCommits.length > 0) {
    const memDir = join(ROOT, 'memory')
    let memContent = ''
    if (existsSync(memDir)) {
      for (const f of readdirSync(memDir).filter(f => f.endsWith('.md'))) {
        try { memContent += readFileSync(join(memDir, f), 'utf8') } catch {}
      }
    }

    for (const { hash, subject } of loopCommits) {
      const short = hash.slice(0, 7)
      const isReviewed = memContent.includes(short) &&
        memContent.slice(memContent.indexOf(short) - 200, memContent.indexOf(short) + 200)
          .includes('[x]')
      if (!isReviewed) {
        report('LOOP-001', 'high', join(ROOT, 'memory'), 0,
          `[loop] commit ${short} ("${subject.slice(0, 60)}") has no reviewed entry in memory/`)
      }
    }
  }
} catch {}

// ─── Report ─────────────────────────────────────────────────────────────────

const all = [...violations, ...warnings]

if (all.length === 0) {
  console.warn('[guard] ✓ clean — no violations found')
  process.exit(0)
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low']
const grouped   = Object.fromEntries(SEV_ORDER.map(s => [s, []]))
for (const v of all) (grouped[v.severity] || grouped.medium).push(v)

for (const sev of SEV_ORDER) {
  const items = grouped[sev]
  if (!items.length) continue
  const icon = sev === 'critical' ? '✖' : sev === 'high' ? '⚠' : 'ℹ'
  console.warn(`\n[guard] ${icon} ${sev.toUpperCase()} (${items.length})`)
  for (const v of items) {
    console.warn(`  [${v.id}] ${v.file}:${v.line} — ${v.message}`)
  }
}

const blockCount = violations.length
const warnCount  = warnings.length
console.warn(`\n[guard] ${blockCount} blocking violation${blockCount !== 1 ? 's' : ''}, ${warnCount} warning${warnCount !== 1 ? 's' : ''}`)

if (blockCount > 0) {
  if (!FIX_MODE) console.warn('[guard] run "npm run guard:fix" to auto-fix safe violations (LOG-001)')
  process.exit(1)
}
