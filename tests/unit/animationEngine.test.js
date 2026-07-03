/**
 * tests/unit/animationEngine.test.js
 *
 * Unit tests for AnimationEngine:
 *  - prefers-reduced-motion branch
 *  - RAF-driven position advance
 *  - Boundary slowdown (8% speed near commit positions)
 *  - FPS jank warning (elapsed > 50ms)
 *  - play / pause / toggle / seekTo / destroy
 *  - onTick + onComplete callbacks
 *
 * All browser globals (window, requestAnimationFrame, performance) are
 * stubbed at module level so tests run in the Node environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Browser globals — must be in place before constructing AnimationEngine ──
// The constructor calls window.matchMedia(...) directly.

let mqlMock

beforeEach(() => {
  mqlMock = { matches: false, addEventListener: vi.fn() }
  globalThis.window = { matchMedia: vi.fn(() => mqlMock) }
  globalThis.performance     = { now: vi.fn(() => 1000) }
  globalThis.requestAnimationFrame  = vi.fn(() => 99)
  globalThis.cancelAnimationFrame   = vi.fn()
})

afterEach(() => {
  delete globalThis.window
  delete globalThis.performance
  delete globalThis.requestAnimationFrame
  delete globalThis.cancelAnimationFrame
})

// Import AFTER globals are defined at module level
// (constructor reads window.matchMedia at instantiation, not at import)
const { AnimationEngine } = await import('../../src/utils/animationEngine.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an engine with safe no-op defaults. */
function engine({ onTick = () => {}, onComplete = () => {}, speed = 0.1, boundaries = [0.5] } = {}) {
  return new AnimationEngine({ onTick, onComplete, speed, boundaries })
}

// ─── prefers-reduced-motion ───────────────────────────────────────────────────

describe('prefers-reduced-motion', () => {
  it('jumps to position 1 immediately when reduced motion is preferred', () => {
    mqlMock.matches = true
    const onTick     = vi.fn()
    const onComplete = vi.fn()
    const eng = engine({ onTick, onComplete })

    eng.play()

    expect(eng.position).toBe(1)
    expect(onTick).toHaveBeenCalledWith(1, 0)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('does not set playing=true when reduced motion fires', () => {
    mqlMock.matches = true
    const eng = engine()
    eng.play()
    expect(eng.playing).toBe(false)
  })

  it('updates _reducedMotion when matchMedia change event fires', () => {
    const eng = engine()
    // Simulate OS-level preference change via the addEventListener callback
    const [[_event, changeHandler]] = globalThis.window.matchMedia.mock.results[0].value.addEventListener.mock.calls
    changeHandler({ matches: true })
    expect(eng._reducedMotion).toBe(true)
  })
})

// ─── play ─────────────────────────────────────────────────────────────────────

describe('play', () => {
  it('sets playing=true and requests first RAF', () => {
    const eng = engine()
    eng.play()
    expect(eng.playing).toBe(true)
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledOnce()
  })

  it('resets position to 0 when play is called at the end', () => {
    const eng = engine()
    eng._position = 1
    eng.play()
    expect(eng._position).toBe(0)
  })

  it('is a no-op if already playing', () => {
    const eng = engine()
    eng.play()
    eng.play()
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledOnce()
  })
})

// ─── pause ────────────────────────────────────────────────────────────────────

describe('pause', () => {
  it('sets playing=false and cancels pending RAF', () => {
    const eng = engine()
    eng.play()
    const rafId = globalThis.requestAnimationFrame.mock.results[0].value
    eng.pause()
    expect(eng.playing).toBe(false)
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(rafId)
  })

  it('nulls out _rafId after cancel', () => {
    const eng = engine()
    eng.play()
    eng.pause()
    expect(eng._rafId).toBeNull()
  })
})

// ─── toggle ───────────────────────────────────────────────────────────────────

describe('toggle', () => {
  it('starts playback when idle', () => {
    const eng = engine()
    eng.toggle()
    expect(eng.playing).toBe(true)
  })

  it('pauses when playing', () => {
    const eng = engine()
    eng.play()
    eng.toggle()
    expect(eng.playing).toBe(false)
  })
})

// ─── seekTo ───────────────────────────────────────────────────────────────────

describe('seekTo', () => {
  it('updates position to given value', () => {
    const eng = engine()
    eng.seekTo(0.42)
    expect(eng.position).toBeCloseTo(0.42)
  })

  it('clamps below 0 to 0', () => {
    const eng = engine()
    eng.seekTo(-0.5)
    expect(eng.position).toBe(0)
  })

  it('clamps above 1 to 1', () => {
    const eng = engine()
    eng.seekTo(1.5)
    expect(eng.position).toBe(1)
  })

  it('calls onTick with the clamped position', () => {
    const onTick = vi.fn()
    const eng    = engine({ onTick })
    eng.seekTo(0.7)
    expect(onTick).toHaveBeenCalledWith(0.7, 0)
  })
})

// ─── destroy ──────────────────────────────────────────────────────────────────

describe('destroy', () => {
  it('pauses the engine', () => {
    const eng = engine()
    eng.play()
    eng.destroy()
    expect(eng.playing).toBe(false)
  })
})

// ─── _tick: position advance ──────────────────────────────────────────────────

describe('_tick: position advance', () => {
  it('advances position by speed * elapsed when far from boundaries', () => {
    const onTick = vi.fn()
    const eng    = engine({ onTick, speed: 0.01, boundaries: [0.9] })
    eng._playing   = true
    eng._lastFrame = 0
    eng._position  = 0.0  // far from 0.9

    eng._tick(10)  // elapsed = 10ms; advance = 0.01 * 10 = 0.1

    expect(eng.position).toBeCloseTo(0.1)
    expect(onTick).toHaveBeenCalledWith(expect.closeTo(0.1, 5), 10)
  })

  it('slows to 8% of normal speed within 0.015 of a boundary', () => {
    // Near boundary (0.01 away from 0.5): effectiveSpeed = speed * 0.08
    const engNear  = engine({ speed: 0.1, boundaries: [0.5] })
    engNear._playing   = true
    engNear._lastFrame = 0
    engNear._position  = 0.49  // |0.49 - 0.5| = 0.01 < 0.015 → nearBoundary

    engNear._tick(10)
    // effectiveSpeed = 0.1 * 0.08 = 0.008; advance = 0.008 * 10 = 0.08
    expect(engNear.position).toBeCloseTo(0.49 + 0.008 * 10, 5)

    // Far from boundary: effectiveSpeed = speed (full)
    const engFar   = engine({ speed: 0.1, boundaries: [0.9] })
    engFar._playing   = true
    engFar._lastFrame = 0
    engFar._position  = 0.49
    engFar._tick(10)  // advance = 0.1 * 10 = 1.0 → capped at 1

    // Near-boundary advance is dramatically less than far-from-boundary
    expect(engNear.position).toBeLessThan(engFar.position)
  })

  it('schedules the next RAF tick when position < 1', () => {
    const eng = engine({ speed: 0.001, boundaries: [] })
    eng._playing   = true
    eng._lastFrame = 0
    eng._position  = 0.0

    eng._tick(1)  // small advance, still < 1
    expect(globalThis.requestAnimationFrame).toHaveBeenCalled()
  })

  it('does nothing if playing is false', () => {
    const onTick = vi.fn()
    const eng    = engine({ onTick })
    eng._playing = false
    eng._tick(10)
    expect(onTick).not.toHaveBeenCalled()
  })
})

// ─── _tick: completion ────────────────────────────────────────────────────────

describe('_tick: completion', () => {
  it('sets playing=false when position reaches 1', () => {
    const eng = engine({ speed: 100, boundaries: [] })  // large speed → hits 1 in one tick
    eng._playing   = true
    eng._lastFrame = 0
    eng._position  = 0.99

    eng._tick(10)
    expect(eng.playing).toBe(false)
  })

  it('calls onComplete when position reaches 1', () => {
    const onComplete = vi.fn()
    const eng        = engine({ onComplete, speed: 100, boundaries: [] })
    eng._playing   = true
    eng._lastFrame = 0
    eng._position  = 0.99

    eng._tick(10)
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not schedule another RAF after completion', () => {
    const eng = engine({ speed: 100, boundaries: [] })
    eng._playing   = true
    eng._lastFrame = 0
    eng._position  = 0.99

    globalThis.requestAnimationFrame.mockClear()
    eng._tick(10)
    // No RAF should be queued after completion
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled()
  })
})

// ─── _tick: FPS jank warning ──────────────────────────────────────────────────

describe('_tick: FPS jank warning', () => {
  it('emits console.warn when elapsed exceeds 50ms', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const eng     = engine({ boundaries: [] })
    eng._playing   = true
    eng._lastFrame = 0

    eng._tick(100)  // elapsed = 100ms > 50ms threshold
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('jank'))
    warnSpy.mockRestore()
  })

  it('does not warn when elapsed is within 16.7ms', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const eng     = engine({ boundaries: [] })
    eng._playing   = true
    eng._lastFrame = 0

    eng._tick(16)  // elapsed = 16ms ≤ 50ms
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
