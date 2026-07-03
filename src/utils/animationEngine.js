// requestAnimationFrame loop with FPS logging and prefers-reduced-motion support
// Per mandatory-patterns.md: NEVER run an animation without frame timing

/**
 * @typedef {Object} AnimationState
 * @property {boolean} playing
 * @property {number}  position    — 0.0 to 1.0 (maps to slider position)
 * @property {number}  speed       — units per ms (default: full replay in ~8s)
 * @property {Function} onTick     — called every frame with (position, deltaMs)
 * @property {Function} onComplete — called when position reaches 1.0
 */

export class AnimationEngine {
  constructor({ onTick, onComplete, speed = 0.000125, boundaries = null } = {}) {
    this._onTick       = onTick
    this._onComplete   = onComplete
    this._speed        = speed
    this._boundaries   = boundaries  // null → use module-level default
    this._playing    = false
    this._position   = 0
    this._rafId      = null
    this._lastFrame  = 0

    // Respect prefers-reduced-motion (WCAG-001)
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', e => { this._reducedMotion = e.matches })
  }

  get position()  { return this._position }
  get playing()   { return this._playing  }

  play() {
    if (this._playing) return
    if (this._position >= 1) this._position = 0

    // If user prefers reduced motion: skip to final frame immediately
    if (this._reducedMotion) {
      this._position = 1
      this._onTick?.(1, 0)
      this._onComplete?.()
      return
    }

    this._playing   = true
    this._lastFrame = performance.now()
    this._rafId     = requestAnimationFrame(ts => this._tick(ts))
  }

  pause() {
    this._playing = false
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  toggle() {
    this._playing ? this.pause() : this.play()
  }

  seekTo(position) {
    this._position = Math.max(0, Math.min(1, position))
    this._onTick?.(this._position, 0)
  }

  destroy() {
    this.pause()
    // No DOM listeners to remove — MediaQueryList listener is on window,
    // which is fine to leave for now (extension context, not SPA)
  }

  _tick(timestamp) {
    if (!this._playing) return

    const elapsed = timestamp - this._lastFrame

    // FPS monitoring per mandatory-patterns.md
    if (elapsed > 50) {
      console.warn(`[diffcast/animation] jank: ${elapsed.toFixed(1)}ms frame (target ≤16.7ms)`)
    }

    this._lastFrame = timestamp

    // Slow down at commit boundary positions (0, 0.33, 0.66, 1.0) to let
    // the reviewer absorb what animated in
    const bounds = this._boundaries ?? COMMIT_BOUNDARIES
    const nearBoundary = bounds.some(b => Math.abs(this._position - b) < 0.015)
    const effectiveSpeed = nearBoundary ? this._speed * 0.08 : this._speed

    this._position = Math.min(1, this._position + effectiveSpeed * elapsed)
    this._onTick?.(this._position, elapsed)

    if (this._position >= 1) {
      this._playing = false
      this._onComplete?.()
      return
    }

    this._rafId = requestAnimationFrame(ts => this._tick(ts))
  }
}

// Positions (0–1) where commits land on the slider
// Mirrors COMMIT_PCTS in the prototype: [2, 33, 66, 97] → [0.02, 0.33, 0.66, 0.97]
const COMMIT_BOUNDARIES = [0.02, 0.33, 0.66, 0.97]
