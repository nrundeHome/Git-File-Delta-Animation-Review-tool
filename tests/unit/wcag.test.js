// WCAG AA contrast ratio tests for DiffCast risk colors.
// Risk colors must achieve ≥4.5:1 contrast on white (#ffffff) — the GitHub page surface.
// The CSS comment in risk-colors.css references #0a0c11; these tests guard the actual
// color values locked in that file against accidental regression.
// Formula: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

import { describe, it, expect } from 'vitest'

// ─── Contrast calculation ──────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function linearize(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminance(hexToRgb(hex1))
  const L2 = relativeLuminance(hexToRgb(hex2))
  const lighter = Math.max(L1, L2)
  const darker  = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ─── Color constants (must match src/styles/risk-colors.css) ──────────────

const WHITE      = '#ffffff'   // GitHub page surface (light injection)
const DARK       = '#0a0c11'   // --bg (Shadow DOM panel surface)

// On-white variants (--risk-hi/md/lo)
const RISK_HI    = '#cf222e'
const RISK_MD    = '#9a6700'
const RISK_LO    = '#1a7f37'

// On-dark variants (--risk-hi-d / --risk-md-d / --risk-lo-d)
const RISK_HI_D  = '#f85149'
const RISK_MD_D  = '#d4a017'
const RISK_LO_D  = '#3fb950'

const WCAG_AA_NORMAL = 4.5   // minimum for normal text (WCAG AA)

// ─── Tests ────────────────────────────────────────────────────────────────

describe('WCAG AA contrast on white (#ffffff)', () => {
  it('--risk-hi meets 4.5:1 minimum', () => {
    const ratio = contrastRatio(RISK_HI, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })

  it('--risk-md meets 4.5:1 minimum', () => {
    const ratio = contrastRatio(RISK_MD, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })

  it('--risk-lo meets 4.5:1 minimum', () => {
    const ratio = contrastRatio(RISK_LO, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })
})

describe('WCAG contrast ratio values are stable', () => {
  it('--risk-hi ratio is in expected range (5.0–5.6)', () => {
    const ratio = contrastRatio(RISK_HI, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(5.0)
    expect(ratio).toBeLessThan(5.6)
  })

  it('--risk-md ratio is in expected range (4.5–5.2)', () => {
    const ratio = contrastRatio(RISK_MD, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeLessThan(5.2)
  })

  it('--risk-lo ratio is in expected range (4.8–5.4)', () => {
    const ratio = contrastRatio(RISK_LO, WHITE)
    expect(ratio).toBeGreaterThanOrEqual(4.8)
    expect(ratio).toBeLessThan(5.4)
  })
})

describe('Risk colors are visually distinct from each other', () => {
  it('hi and md have contrast ratio > 1.0 (are not identical)', () => {
    expect(contrastRatio(RISK_HI, RISK_MD)).toBeGreaterThan(1.0)
  })

  it('md and lo have contrast ratio > 1.0 (are not identical)', () => {
    expect(contrastRatio(RISK_MD, RISK_LO)).toBeGreaterThan(1.0)
  })

  it('hi and lo have contrast ratio > 1.0 (are not identical)', () => {
    expect(contrastRatio(RISK_HI, RISK_LO)).toBeGreaterThan(1.0)
  })
})

describe('WCAG AA contrast on dark (#0a0c11) — Shadow DOM panel', () => {
  it('--risk-hi-d meets 4.5:1 on dark background', () => {
    expect(contrastRatio(RISK_HI_D, DARK)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })

  it('--risk-md-d meets 4.5:1 on dark background', () => {
    expect(contrastRatio(RISK_MD_D, DARK)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })

  it('--risk-lo-d meets 4.5:1 on dark background', () => {
    expect(contrastRatio(RISK_LO_D, DARK)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })

  it('--risk-hi (on-white value) does NOT meet 4.5:1 on dark — use -d variant instead', () => {
    // This test documents the known limitation so no one accidentally uses the wrong color
    expect(contrastRatio(RISK_HI, DARK)).toBeLessThan(WCAG_AA_NORMAL)
  })
})

describe('contrastRatio() helper is correct', () => {
  it('white on black = 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('same color = 1:1', () => {
    expect(contrastRatio('#4f6ef7', '#4f6ef7')).toBeCloseTo(1, 1)
  })
})
