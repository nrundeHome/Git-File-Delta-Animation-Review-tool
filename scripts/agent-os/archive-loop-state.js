#!/usr/bin/env node
/**
 * scripts/agent-os/archive-loop-state.js — Prune loop state files
 *
 * Keeps the 7 most recent loop-state-*.md files per loop name.
 * Moves older files to memory/_archive/.
 *
 * File naming convention: memory/loop-state-{loop-name}-{YYYY-MM-DD}.md
 *
 * Usage: node scripts/agent-os/archive-loop-state.js [--dry-run]
 */

import { readdirSync, renameSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '../..')
const MEMORY    = join(ROOT, 'memory')
const ARCHIVE   = join(MEMORY, '_archive')
const DRY_RUN   = process.argv.includes('--dry-run')
const KEEP      = 7

if (!existsSync(MEMORY)) {
  console.warn('[archive-loop-state] No memory/ directory — nothing to do')
  process.exit(0)
}

// Collect loop state files (exclude _archive/ subdirectory)
const files = readdirSync(MEMORY)
  .filter(f => f.startsWith('loop-state-') && f.endsWith('.md'))

if (files.length === 0) {
  console.warn('[archive-loop-state] No loop state files found')
  process.exit(0)
}

// Group by loop name (everything between "loop-state-" and "-YYYY-MM-DD.md")
const DATE_RE  = /-(\d{4}-\d{2}-\d{2})\.md$/
const groups   = new Map()

for (const file of files) {
  const dateMatch = file.match(DATE_RE)
  if (!dateMatch) continue
  const date     = dateMatch[1]
  const loopName = file.slice('loop-state-'.length, file.length - `-${date}.md`.length)
  if (!groups.has(loopName)) groups.set(loopName, [])
  groups.get(loopName).push({ file, date })
}

let archived = 0
let kept     = 0

for (const [loopName, entries] of groups) {
  // Sort newest first
  entries.sort((a, b) => b.date.localeCompare(a.date))

  const toKeep    = entries.slice(0, KEEP)
  const toArchive = entries.slice(KEEP)

  kept += toKeep.length

  for (const { file } of toArchive) {
    const src  = join(MEMORY, file)
    const dest = join(ARCHIVE, file)

    if (DRY_RUN) {
      console.warn(`[archive-loop-state] DRY     ${file} → _archive/`)
    } else {
      mkdirSync(ARCHIVE, { recursive: true })
      renameSync(src, dest)
      console.warn(`[archive-loop-state] ARCHIVE ${file} → _archive/`)
    }
    archived++
  }

  if (toArchive.length === 0) {
    console.warn(`[archive-loop-state] KEEP    ${loopName} — ${toKeep.length} file(s), all within limit`)
  }
}

const action = DRY_RUN ? 'would archive' : 'archived'
console.warn(`[archive-loop-state] Done — ${action} ${archived} file(s), kept ${kept}`)
