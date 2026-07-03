# ADR-003: Vanilla JS — No UI Framework

**Status:** Accepted  
**Date:** 2026-07-03

## Context
The core UI is an animation engine driving a diff table. Choosing a framework adds bundle size and a reconciliation layer that competes with our manual DOM control.

## Decision
Vanilla JS + direct DOM manipulation. Vite for bundling and dev server. No React, Vue, or Svelte.

## Consequences
- Bundle target: < 120KB uncompressed (vs ~150KB for React alone)
- Fast extension load — no framework bootstrap cost
- `requestAnimationFrame` loop drives line reveal animations directly; no VDOM diffing latency
- Manual DOM patterns required (see `mandatory-patterns.md` for listener cleanup rules)
- No component lifecycle — explicit `init()` / `destroy()` pattern enforced on all classes

## Bundle budget
| Dependency | Size (est.) |
|---|---|
| `acorn` (JS tokenizer for complexity delta) | ~45KB |
| `gif.js` (export replay as GIF, Phase 2) | ~25KB |
| DiffCast app code | ~35KB |
| **Total** | **~105KB** |

## Rejected alternatives
- **React:** 150KB+ before our code. Framework lifecycle fights our animation loop. JSX in content scripts has CSP implications.
- **Svelte:** Smaller but still adds compiled overhead. Svelte's reactivity model conflicts with the imperative animation engine.
- **Preact:** Viable fallback if component complexity grows past ~20 components. Revisit at Phase 4.
