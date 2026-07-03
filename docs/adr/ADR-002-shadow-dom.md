# ADR-002: Shadow DOM for UI Injection

**Status:** Accepted  
**Date:** 2026-07-03

## Context
Our extension injects a full UI panel into `github.com` PR pages. GitHub's CSS is aggressive and frequently updated. We need style isolation in both directions.

## Decision
Mount all DiffCast UI inside a Shadow DOM host element attached to the PR page body.

```javascript
// content.js
const host = document.createElement('div')
host.id = 'diffcast-host'
const shadow = host.attachShadow({ mode: 'closed' })
document.body.appendChild(host)
// mount App.js into shadow root
```

## Consequences
- GitHub's CSS cannot reach inside our shadow root
- Our CSS cannot leak into the GitHub page
- GitHub DOM structure changes cannot break our layout (we only need the injection anchor, not their internal DOM)
- Extension CSS must be inlined or injected into the shadow root directly (cannot use `<link>` to external stylesheet from within shadow root in MV3)
- DevTools inspection of shadow DOM requires "Show user agent shadow DOM" — acceptable for development

## Rejected alternatives
- **iframe:** Would require `allow-same-origin` on a cross-origin context — blocked by GitHub's CSP
- **Direct DOM injection (no Shadow DOM):** CSS conflicts with GitHub's stylesheet are unpredictable and break on every GitHub redesign
