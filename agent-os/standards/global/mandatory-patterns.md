# Mandatory Coding Patterns

Every pattern here is enforced by `npm run guard`. Violations block commit.

---

## API

**Never use bare `fetch()` for GitHub API — always use the `githubApi()` wrapper:**
```javascript
githubApi().path('/repos/{owner}/{repo}/pulls/{pr}').get()   // ✅ auth + rate-limit retry
fetch('https://api.github.com/...')                           // ✗ — no auth, no retry
```

**Never hardcode API versions — import from `src/config/api.js`:**
```javascript
import { GITHUB_API_VERSION } from 'src/config/api.js'       // ✅
fetch('https://api.github.com/v3/...')                        // ✗ — breaks without warning
```

**Always check response shape before destructuring:**
```javascript
const data = await githubApi().path('/...').get().then(r => r.json())
if (data.status !== 'ok') { console.error('unexpected response:', data); return }
// safe to use data.diff, data.commits, etc.
```

---

## Animation

**Every `requestAnimationFrame` loop must log frame timing:**
```javascript
let lastFrame = 0
requestAnimationFrame(function tick(timestamp) {
  const elapsed = timestamp - lastFrame
  if (elapsed < 16.7) { /* skip if < 60fps threshold */ }
  if (elapsed > 50) console.warn(`[animation] jank: ${elapsed.toFixed(1)}ms frame`)
  lastFrame = timestamp
  // render logic
  requestAnimationFrame(tick)
})
```

**Every animation entry point must respect `prefers-reduced-motion`:**
```javascript
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (prefersReduced) {
  renderFrame(timeline.length - 1)   // jump to final frame
  return
}
startAnimation()
```

---

## Risk Colors

**All risk colors must live in `src/styles/risk-colors.css` — never hardcode elsewhere:**
```css
:root {
  --risk-low:    #1a7f37;   /* 5.2:1 on white — WCAG AA ✅ */
  --risk-medium: #9a6700;   /* 4.6:1 on white — WCAG AA ✅ */
  --risk-high:   #cf222e;   /* 5.1:1 on white — WCAG AA ✅ */
}
```
Minimum contrast ratio: 4.5:1. Verify every new color in Colour Contrast Analyser before committing.

---

## Components

**All event listeners must be removed in `destroy()`:**
```javascript
class TimeSlider {
  init() {
    this._onSlide = this._handleSlide.bind(this)
    this._el.addEventListener('input', this._onSlide)
  }
  destroy() {
    this._el.removeEventListener('input', this._onSlide)  // REQUIRED
  }
}
```

---

## Logging

**`console.log` is blocked in committed code.** Allowed: `console.error`, `console.warn`, or a `// keep` comment to explicitly bypass.

Pre-commit hook enforces this — do not use `--no-verify` to skip it.
