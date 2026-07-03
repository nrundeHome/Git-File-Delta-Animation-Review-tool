// Content script — injected into github.com PR detail and PR list pages
// Responsibility:
//   PR detail (/pull/N)  → inject DiffCast tab, mount Shadow DOM overlay
//   PR list  (/pulls)    → inject risk pills next to PR titles, add toggle
// Per ADR-002: Shadow DOM for the overlay; lightweight inline styles for list badges

;(function diffcastInit() {
  // Only run once per page (SPA navigation re-triggers content scripts)
  if (document.getElementById('diffcast-host') || document.getElementById('dc-list-toggle')) return

  // ── PR list page ─────────────────────────────────────────────────────────
  const PR_LIST_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pulls/
  const listMatch  = location.href.match(PR_LIST_RE)
  if (listMatch) {
    const [, owner, repo] = listMatch
    waitFor('[id^="issue_"]', 6000)
      .then(() => initBadgeInjection(owner, repo))
      .catch(() => console.warn('[diffcast] PR list rows not found'))
    return
  }

  // ── PR detail page ───────────────────────────────────────────────────────
  const PR_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  const match = location.href.match(PR_URL_RE)
  if (!match) return

  const [, owner, repo, prNumber] = match

  // ─── Wait for GitHub's tab bar to render ──────────────────────────────────
  waitFor('.tabnav-tabs, [role="tablist"]', 5000)
    .then(tabBar => {
      injectTab(tabBar, owner, repo, parseInt(prNumber))
    })
    .catch(() => {
      console.warn('[diffcast] Could not find GitHub tab bar — page structure may have changed')
    })
})()

// ─── Inject DiffCast tab into GitHub's tab bar ────────────────────────────

function injectTab(tabBar, owner, repo, prNumber) {
  if (tabBar.querySelector('#diffcast-tab')) return

  const tab = document.createElement('a')
  tab.id        = 'diffcast-tab'
  tab.className = 'tabnav-tab'
  tab.href      = '#diffcast'
  tab.setAttribute('role', 'tab')
  tab.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 16 16" style="vertical-align:middle;margin-right:4px;fill:currentColor">
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM5 6.25v3.5L10.5 8 5 6.25z"/>
    </svg>
    DiffCast
    <span class="Counter" style="background:#4f6ef7;color:white;font-size:10px">PRO</span>
  `
  tab.style.cssText = 'color:#4f6ef7;border-bottom-color:#4f6ef7;cursor:pointer;'
  tab.addEventListener('click', e => {
    e.preventDefault()
    toggleOverlay(owner, repo, prNumber)
  })

  tabBar.appendChild(tab)
}

// ─── Shadow DOM overlay ───────────────────────────────────────────────────

let overlayMounted = false
let overlayVisible = false

function toggleOverlay(owner, repo, prNumber) {
  if (!overlayMounted) {
    mountOverlay(owner, repo, prNumber)
    overlayMounted = true
    overlayVisible = true
  } else {
    overlayVisible = !overlayVisible
    const host = document.getElementById('diffcast-host')
    if (host) host.style.display = overlayVisible ? 'block' : 'none'
  }
}

async function mountOverlay(owner, repo, prNumber) {
  // Create shadow host
  const host = document.createElement('div')
  host.id = 'diffcast-host'
  host.style.cssText = `
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 70vh;
    z-index: 9999;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.6);
  `

  // Per ADR-002: closed shadow DOM for full CSS isolation
  const shadow = host.attachShadow({ mode: 'closed' })
  document.body.appendChild(host)

  // Mount loading state immediately
  shadow.innerHTML = loadingHTML()

  // Request PR data from service worker
  try {
    const data = await chrome.runtime.sendMessage({
      type: 'LOAD_PR', owner, repo, prNumber,
    })

    if (!data) {
      shadow.innerHTML = errorHTML('No response from DiffCast service worker — try reloading the page')
      return
    }

    if (data.error) {
      shadow.innerHTML = errorHTML(data.error)
      return
    }

    // Dynamically import the DiffCast app module and mount it
    const { mountApp } = await import('./diffcast/app.js')
    mountApp(shadow, data, { owner, repo, prNumber, headBranch: data.headBranch ?? '' })

  } catch (err) {
    shadow.innerHTML = errorHTML(err.message)
    console.error('[diffcast] Failed to load PR data:', err)
  }
}

// ─── Utility HTML states ──────────────────────────────────────────────────

function loadingHTML() {
  return `
    <style>
      :host { all: initial; }
      .dc-loading {
        background: #060811; color: #b0bcd8;
        font-family: 'DM Sans', system-ui, sans-serif;
        height: 100%; display: flex; align-items: center; justify-content: center;
        flex-direction: column; gap: 12px;
      }
      .dc-spinner {
        width: 28px; height: 28px; border-radius: 50%;
        border: 3px solid #1e2235; border-top-color: #4f6ef7;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .dc-load-text { font-size: 13px; color: #5a6380; }
    </style>
    <div class="dc-loading">
      <div class="dc-spinner"></div>
      <div class="dc-load-text">Fetching commits…</div>
    </div>
  `
}

function errorHTML(message) {
  return `
    <style>
      .dc-error {
        background: #060811; color: var(--risk-hi-d);
        font-family: monospace; font-size: 12px;
        height: 100%; display: flex; align-items: center; justify-content: center;
        flex-direction: column; gap: 8px; padding: 24px;
      }
      .dc-error-msg { color: #b0bcd8; max-width: 400px; text-align: center; line-height: 1.5; }
    </style>
    <div class="dc-error">
      <span>⚠ DiffCast error</span>
      <span class="dc-error-msg">${escapeHtml(message)}</span>
    </div>
  `
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── PR list badge injection ──────────────────────────────────────────────

let badgesVisible = true

function initBadgeInjection(owner, repo) {
  injectBadgeStyles()
  injectToggleButton()

  // Collect all visible PR rows (GitHub uses id="issue_N" on each row)
  const rows     = [...document.querySelectorAll('[id^="issue_"]')]
  const prNumbers = rows
    .map(row => {
      const link = row.querySelector('a[data-hovercard-type="pull_request"], a[href*="/pull/"]')
      const m    = link?.getAttribute('href')?.match(/\/pull\/(\d+)/)
      return m ? parseInt(m[1]) : null
    })
    .filter(Boolean)
    .slice(0, 10)  // max 10 per page to avoid hammering the API

  if (!prNumbers.length) return

  chrome.runtime.sendMessage({
    type: 'GET_PR_RISK_BATCH', owner, repo, prNumbers,
  }).then(results => {
    if (!results) return
    const scoreMap = Object.fromEntries(results.map(r => [r.prNumber, r.score]))
    rows.forEach((row, i) => {
      const link = row.querySelector('a[data-hovercard-type="pull_request"], a[href*="/pull/"]')
      const m    = link?.getAttribute('href')?.match(/\/pull\/(\d+)/)
      if (!m) return
      const prNum = parseInt(m[1])
      const score = scoreMap[prNum]
      if (score == null) return
      injectPill(link, score, i)
    })
  }).catch(() => {})  // silently ignore if service worker isn't ready
}

function injectPill(titleLink, score, staggerIndex) {
  // Avoid double-injection
  if (titleLink.parentNode.querySelector('.dc-risk-pill')) return

  const tier  = score >= 67 ? 'hi' : score >= 34 ? 'md' : 'lo'
  const color = `var(--dc-risk-${tier})`
  const bg    = `var(--dc-risk-${tier}-bg)`
  const label = score >= 67 ? '⬤ High risk' : score >= 34 ? '⬤ Med risk' : '⬤ Low risk'

  const pill = document.createElement('span')
  pill.className = 'dc-risk-pill'
  pill.setAttribute('data-dc-tier', tier)
  pill.setAttribute('title', `DiffCast risk score: ${score}/100`)
  pill.style.cssText = `
    display: inline-flex; align-items: center; gap: 4px;
    margin-left: 7px; padding: 1px 7px;
    border-radius: 10px; border: 1px solid ${color};
    background: ${bg}; color: ${color};
    font-size: 10px; font-weight: 600; font-family: ui-monospace, monospace;
    vertical-align: middle; cursor: default; white-space: nowrap;
    opacity: 0;
    animation: dc-badge-in 220ms cubic-bezier(0.16,1,0.3,1) ${staggerIndex * 40}ms forwards;
  `
  pill.textContent = label

  titleLink.insertAdjacentElement('afterend', pill)
}

function injectToggleButton() {
  if (document.getElementById('dc-list-toggle')) return

  const btn = document.createElement('button')
  btn.id = 'dc-list-toggle'
  btn.textContent = '⬤ DiffCast'
  btn.style.cssText = `
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 6px; cursor: pointer;
    font-size: 12px; font-weight: 600; font-family: ui-monospace, monospace;
    border: 1px solid rgba(79,110,247,0.4);
    background: rgba(79,110,247,0.06); color: #4f6ef7;
    vertical-align: middle; margin-left: 8px;
    transition: background 0.15s, opacity 0.15s;
  `
  btn.title = 'Toggle DiffCast risk badges'
  btn.addEventListener('click', () => {
    badgesVisible = !badgesVisible
    document.querySelectorAll('.dc-risk-pill').forEach(p => {
      p.style.display = badgesVisible ? '' : 'none'
    })
    btn.style.opacity = badgesVisible ? '1' : '0.4'
  })
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(79,110,247,0.12)' })
  btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(79,110,247,0.06)' })

  // Insert near the PR list filter bar
  const toolbar = document.querySelector(
    '.table-list-filters, .subnav, [aria-label="Filters"] form, .js-issue-list-filter-form'
  )
  if (toolbar) {
    toolbar.appendChild(btn)
  } else {
    // Fallback: float in top-right of page
    btn.style.position = 'fixed'
    btn.style.top      = '12px'
    btn.style.right    = '16px'
    btn.style.zIndex   = '9000'
    document.body.appendChild(btn)
  }
}

function injectBadgeStyles() {
  if (document.getElementById('dc-badge-styles')) return
  const style = document.createElement('style')
  style.id = 'dc-badge-styles'
  style.textContent = `
    :root {
      --dc-risk-hi:    #cf222e;
      --dc-risk-md:    #9a6700;
      --dc-risk-lo:    #1a7f37;
      --dc-risk-hi-bg: rgba(207,34,46,0.08);
      --dc-risk-md-bg: rgba(154,103,0,0.08);
      --dc-risk-lo-bg: rgba(26,127,55,0.08);
    }
    @keyframes dc-badge-in {
      from { opacity: 0; transform: scale(0.82) translateY(1px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);   }
    }
    @media (prefers-reduced-motion: reduce) {
      .dc-risk-pill { animation: none !important; opacity: 1 !important; }
    }
  `
  document.head.appendChild(style)
}

// ─── DOM wait utility ─────────────────────────────────────────────────────

function waitFor(selector, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector)
    if (el) { resolve(el); return }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) { observer.disconnect(); resolve(found) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)) }, timeoutMs)
  })
}
