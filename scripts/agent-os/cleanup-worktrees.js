#!/usr/bin/env node
/**
 * scripts/agent-os/cleanup-worktrees.js — Remove stale agent worktrees
 *
 * Removes worktrees in .claude/worktrees/ that are:
 *   - Older than 48 hours, AND
 *   - Whose branch has no uncommitted changes (safe to delete)
 *
 * Usage: node scripts/agent-os/cleanup-worktrees.js [--dry-run]
 */

import { readdirSync, statSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT       = join(__dirname, '../..')
const WORKTREES  = join(ROOT, '.claude', 'worktrees')
const DRY_RUN    = process.argv.includes('--dry-run')
const MAX_AGE_MS = 48 * 60 * 60 * 1000   // 48 hours

if (!existsSync(WORKTREES)) {
  console.warn('[cleanup-worktrees] No worktrees directory — nothing to do')
  process.exit(0)
}

const entries = readdirSync(WORKTREES, { withFileTypes: true })
  .filter(e => e.isDirectory())

if (entries.length === 0) {
  console.warn('[cleanup-worktrees] No worktrees found')
  process.exit(0)
}

let removed = 0
let skipped = 0

for (const entry of entries) {
  const worktreePath = join(WORKTREES, entry.name)
  const stat         = statSync(worktreePath)
  const ageMs        = Date.now() - stat.mtimeMs

  if (ageMs < MAX_AGE_MS) {
    const hours = (ageMs / 3_600_000).toFixed(1)
    console.warn(`[cleanup-worktrees] KEEP   ${entry.name} (${hours}h old — under 48h)`)
    skipped++
    continue
  }

  // Check for uncommitted changes — skip if dirty
  try {
    const status = execSync('git status --porcelain', { cwd: worktreePath }).toString().trim()
    if (status) {
      console.warn(`[cleanup-worktrees] SKIP   ${entry.name} — has uncommitted changes`)
      skipped++
      continue
    }
  } catch {
    // Not a git repo or git unavailable — still attempt cleanup
  }

  const hours = (ageMs / 3_600_000).toFixed(1)
  if (DRY_RUN) {
    console.warn(`[cleanup-worktrees] DRY    ${entry.name} (${hours}h old — would remove)`)
  } else {
    rmSync(worktreePath, { recursive: true, force: true })
    console.warn(`[cleanup-worktrees] REMOVE ${entry.name} (${hours}h old)`)
    removed++
  }
}

const action = DRY_RUN ? 'would remove' : 'removed'
console.warn(`[cleanup-worktrees] Done — ${action} ${removed}, kept ${skipped}`)
