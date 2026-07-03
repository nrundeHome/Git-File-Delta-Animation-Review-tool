// src/diffcast/app.js
// Main Shadow DOM application — mounted by content.js when user clicks the DiffCast tab.
// Contract: content.js calls mountApp(shadow, prData, { owner, repo, prNumber })

import variablesCss from '../styles/variables.css?inline'
import riskColorsCss from '../styles/risk-colors.css?inline'
import { AnimationEngine } from '../utils/animationEngine.js'

// ── Module-level state — reset on each mountApp call ──────────────────────
let _shadow, _commits, _frameModel, _fileKeys, _cpcts
let _commitRiskScores, _dangerousWindows
let _curFile, _curCommit, _prevCommit, _sliderVal
let _splitOn, _curView, _engine
let _autoSplit, _autoSplitTimer, _toastTimer

// ── Entry point ───────────────────────────────────────────────────────────
export function mountApp(shadow, prData, { owner, repo, prNumber }) {
  _shadow = shadow

  const { commits, frameModel, commitRiskScores, dangerousWindows, truncated, totalCommits, tier } = prData
  _commits           = commits
  _frameModel        = frameModel
  _commitRiskScores  = commitRiskScores
  _dangerousWindows  = dangerousWindows ?? []
  _fileKeys          = Object.keys(frameModel)
  _curFile           = _fileKeys[0]
  _curCommit         = -1
  _prevCommit        = -1
  _sliderVal         = 0
  _splitOn           = false
  _curView           = 'james'
  _autoSplit         = new Set()
  _autoSplitTimer    = null
  _toastTimer        = null

  const n  = commits.length
  _cpcts   = commits.map((_, i) => n === 1 ? 50 : Math.round(2 + (i / (n - 1)) * 95))

  // Inject Google Fonts
  const link = document.createElement('link')
  link.rel  = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Lora:ital,wght@1,400&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
  shadow.appendChild(link)

  // Inject styles
  const style = document.createElement('style')
  style.textContent = buildStyles()
  shadow.appendChild(style)

  // Build and insert HTML
  const root = document.createElement('div')
  root.className = 'dc-app'
  root.setAttribute('data-view', 'james')
  root.innerHTML = buildHTML({ fileKeys: _fileKeys, commits, commitRiskScores, dangerousWindows: _dangerousWindows, truncated, totalCommits, tier, owner, repo, prNumber })
  shadow.appendChild(root)

  // Init
  buildFileList()
  buildNeilSidebar()
  initEngine()
  buildLanes()
  buildPips()
  buildSparkline()
  renderDiff(_curFile, _shadow.getElementById('diffTable1'))
  const secondFile = _fileKeys[1]
  if (secondFile) renderDiff(secondFile, _shadow.getElementById('diffTable2'))
  applyState(-1, false)
  wireAll()
  if (truncated) showFreeBanner(commits.length, totalCommits)
}

// ── HTML builder ──────────────────────────────────────────────────────────
function buildHTML({ fileKeys, commits, commitRiskScores, dangerousWindows, truncated, totalCommits, tier, owner, repo, prNumber }) {
  return `
<div class="dc-toolbar">
  <div class="dc-logo"><div class="dc-orb"></div>DiffCast</div>
  <div class="toolbar-sep"></div>
  <div class="view-toggle">
    <button class="vt-btn active" id="btnJames" data-testid="view-btn-reviewer">👁 Reviewer</button>
    <button class="vt-btn" id="btnNeil" data-testid="view-btn-author">✍ Author</button>
  </div>
  <div class="toolbar-sep"></div>
  <div class="tb-stat" id="prMeta">${esc(owner)}/${esc(repo)} #${esc(String(prNumber))}</div>
  <div class="tb-right">
    <div id="splitBtnWrap">
      <span class="split-btn-notice" id="splitNotice"></span>
      <button class="split-btn" id="splitBtn" data-testid="split-btn">⊟ <span id="splitBtnLabel">Split view</span></button>
    </div>
  </div>
</div>

<div class="dc-sidebar">
  <div class="james-sidebar">
    <div class="sidebar-sec">
      <div class="sidebar-lbl">Changed Files</div>
      <div id="fileList" data-testid="file-list"></div>
    </div>
    <div class="risk-breakdown" data-testid="risk-breakdown">
      <div class="sidebar-lbl">Risk breakdown</div>
      <div class="rb-row"><span class="rb-lbl hi">HIGH</span><div class="rb-track"><div class="rb-fill" id="rb-hi"></div></div><span class="rb-pct" id="rp-hi">0%</span></div>
      <div class="rb-row"><span class="rb-lbl md">MED</span><div class="rb-track"><div class="rb-fill" id="rb-md"></div></div><span class="rb-pct" id="rp-md">0%</span></div>
      <div class="rb-row"><span class="rb-lbl lo">LOW</span><div class="rb-track"><div class="rb-fill" id="rb-lo"></div></div><span class="rb-pct" id="rp-lo">0%</span></div>
    </div>
  </div>

  <div class="neil-sidebar">
    <div class="sidebar-lbl">Commit narrative</div>
    <div id="neilCommitList"></div>
  </div>
</div>

<div class="dc-main" id="dcMain">
  <div class="neil-diff-heading" id="neilDiffHeading">—</div>
  <div class="code-header">
    <span class="filepath" id="filepath"></span>
    <span class="ctx-hash">commit <span id="ctxHash">—</span></span>
  </div>
  <div class="code-body" id="codeBody">
    <div class="code-pane">
      <div class="pane-hdr split-pane-header" id="pane1Hdr"></div>
      <div class="pane-scroll"><table class="diff-table" id="diffTable1" data-testid="diff-table-primary"></table></div>
    </div>
    <div class="code-pane">
      <div class="pane-hdr split-pane-header" id="pane2Hdr"></div>
      <div class="pane-scroll"><table class="diff-table" id="diffTable2" data-testid="diff-table-secondary"></table></div>
    </div>
  </div>
  <div class="auto-split-notice" id="autoSplitNotice">⊟ Split view — commit touches 2+ high-risk files</div>
  <div class="dw-toast" id="dwToast" data-testid="risk-toast">
    <div class="dw-title" id="dwTitle">⚠ RISK ALERT</div>
    <div class="dw-body" id="dwBody"></div>
  </div>
  <div class="neil-toast" id="neilToast" data-testid="commit-toast">
    <div class="nt-title" id="ntTitle">✓ COMMIT</div>
    <div class="nt-body" id="ntBody"></div>
  </div>
</div>

<div class="dc-timeline">
  <div class="tl-ctrl">
    <button class="play-btn" id="playBtn" data-testid="play-btn"><div class="play-icon"></div></button>
    <div class="tl-hint">SPC<br>play</div>
  </div>
  <div class="tl-tracks">
    <div class="lanes" id="lanesEl"></div>
    <div class="dw-stripe" id="dwStripe"><span class="dw-stripe-label" id="dwLabel">⚠ auth gap</span></div>
    <div class="spk-row">
      <span class="spk-lbl">risk ↑</span>
      <div class="spk-wrap">
        <svg id="spkSvg" viewBox="0 0 100 22" preserveAspectRatio="none">
          <defs><clipPath id="spkClip"><rect id="spkRect" x="0" y="0" width="0" height="22"/></clipPath></defs>
          <g id="spkDim"></g>
          <g id="spkFill" clip-path="url(#spkClip)"></g>
          <line id="spkLine" x1="0" y1="0" x2="0" y2="22" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
        </svg>
      </div>
    </div>
    <div class="slider-sec">
      <div class="pip-row" id="pipRow">
        <div class="dw-pip-zone" id="dwPipZone"></div>
      </div>
      <div class="slider-row">
        <span class="sl-lbl" id="slLbl">← drag to replay</span>
        <button class="step-btn" id="prevBtn" disabled>◀</button>
        <input type="range" id="slider" min="0" max="100" value="0" data-testid="time-slider">
        <button class="step-btn" id="nextBtn" disabled>▶</button>
      </div>
    </div>
  </div>
  <div class="tl-info">
    <div class="ci-card" data-testid="commit-card">
      <span class="ci-hash" id="ciHash" data-testid="commit-hash">——</span>
      <span class="ci-msg" id="ciMsg" data-testid="commit-message">Drag the slider to replay</span>
      <span class="ci-meta"><span id="ciAuthor" data-testid="commit-author">——</span> · <span id="ciTime">——</span></span>
    </div>
    <div class="touch-list" id="touchList"></div>
  </div>
</div>

<div class="free-banner" id="freeBanner" style="display:none">
  <span id="freeBannerText"></span>
  <a class="upgrade-link" href="https://diffcast.app/upgrade" target="_blank">Upgrade to Pro →</a>
</div>
`
}

// ── CSS ───────────────────────────────────────────────────────────────────
function buildStyles() { return variablesCss + '\n' + riskColorsCss + '\n' + APP_CSS }

const APP_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.dc-app {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  display: grid;
  grid-template-rows: 42px minmax(250px, 1fr) 194px;
  grid-template-columns: clamp(200px, 15vw, 300px) 1fr;
  grid-template-areas:
    "toolbar toolbar"
    "sidebar main"
    "timeline timeline";
  height: 100%;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 0 0 8px 8px;
  position: relative;
}

/* Neil view: warm editorial overrides */
.dc-app[data-view="neil"] {
  --bg:          #f6f4ef;
  --surface:     #eceae4;
  --panel:       #e4e1d9;
  --border:      #d4d0c4;
  --border-hi:   #c0bbb0;
  --text:        #3a3628;
  --text-dim:    #9a9488;
  --text-bright: #1a1814;
  --accent:      #2c6e49;
  --accent-bg:   rgba(44,110,73,0.10);
  --accent-glow: rgba(44,110,73,0.30);
  --risk-hi:     #b91c1c;
  --risk-hi-bg:  rgba(185,28,28,0.07);
  --risk-hi-gl:  rgba(185,28,28,0.20);
  --risk-md:     #92400e;
  --risk-md-bg:  rgba(146,64,14,0.07);
  --risk-md-gl:  rgba(146,64,14,0.20);
  --risk-lo:     #166534;
  --risk-lo-bg:  rgba(22,101,52,0.07);
  --risk-lo-gl:  rgba(22,101,52,0.20);
}

/* ── Toolbar ── */
.dc-toolbar {
  grid-area: toolbar;
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 14px;
}
.dc-logo {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 13.5px;
  letter-spacing: -0.02em;
  color: var(--text-bright);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.dc-orb {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}
.toolbar-sep { width: 1px; height: 20px; background: var(--border); }
.tb-stat { font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px; }
.tb-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }

/* view toggle */
.view-toggle {
  display: flex;
  background: var(--bg);
  border: 1px solid var(--border-hi);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.vt-btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-dim);
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-sans);
}
.vt-btn.active { background: var(--surface); color: var(--text-bright); }

/* split btn */
.split-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-hi);
  background: transparent;
  color: var(--text-dim);
  font-size: 11px; font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  font-family: var(--font-sans);
}
.split-btn:hover { background: var(--panel); color: var(--text); border-color: var(--accent); }
.split-btn.active { background: var(--accent-bg); color: var(--accent); border-color: var(--accent); }
.split-btn-notice {
  font-size: 9.5px; padding: 2px 7px;
  background: var(--risk-hi-bg); border: 1px solid var(--risk-hi-gl); border-radius: 3px;
  color: var(--risk-hi); font-weight: 600; letter-spacing: 0.04em;
}
#splitBtnWrap { display: none; }
#splitBtnWrap.visible { display: flex; align-items: center; gap: 8px; }

/* ── Sidebar ── */
.dc-sidebar {
  grid-area: sidebar;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.sidebar-sec { padding: 10px 0 6px; }
.sidebar-lbl {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--text-dim); padding: 0 12px 6px;
}

/* James sidebar */
.james-sidebar { display: flex; flex-direction: column; }
.dc-app[data-view="neil"] .james-sidebar { display: none; }

.file-entry {
  padding: 6px 12px; cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s, border-color 0.1s;
}
.file-entry:hover { background: var(--panel); }
.file-entry.active { background: var(--panel); border-left-color: var(--accent); }
.fe-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.fe-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.fe-lo { background: var(--risk-lo); }
.fe-md { background: var(--risk-md); }
.fe-hi { background: var(--risk-hi); }
.file-entry.active .fe-hi { box-shadow: 0 0 6px var(--risk-hi); }
.file-entry.active .fe-md { box-shadow: 0 0 6px var(--risk-md); }
.file-entry.active .fe-lo { box-shadow: 0 0 6px var(--risk-lo); }
.fe-name { font-family: var(--font-mono); font-size: 10px; color: var(--text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fe-stat { font-size: 9.5px; color: var(--text-dim); font-family: var(--font-mono); }
.fe-spark { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.fe-spark-fill { height: 100%; border-radius: 2px; transition: width 0.5s cubic-bezier(0.16,1,0.3,1); }
.fe-cochange { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 4px; }
.cochange-pill {
  font-size: 8.5px; padding: 1px 5px; border-radius: 8px; border: 1px solid;
  display: none;
}
.cochange-pill.show { display: inline-block; }
.cp-lo { color: var(--risk-lo); border-color: var(--risk-lo-gl); }
.cp-md { color: var(--risk-md); border-color: var(--risk-md-gl); }
.cp-hi { color: var(--risk-hi); border-color: var(--risk-hi-gl); }

/* Risk breakdown */
.risk-breakdown { padding: 10px 12px 12px; border-top: 1px solid var(--border); margin-top: auto; }
.rb-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.rb-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; width: 32px; }
.rb-lbl.hi { color: var(--risk-hi); }
.rb-lbl.md { color: var(--risk-md); }
.rb-lbl.lo { color: var(--risk-lo); }
.rb-track { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.rb-fill { height: 100%; border-radius: 2px; transition: width 0.5s cubic-bezier(0.16,1,0.3,1); }
.rb-pct { font-family: var(--font-mono); font-size: 9.5px; color: var(--text-dim); width: 26px; text-align: right; }

/* Neil sidebar */
.neil-sidebar { display: none; flex-direction: column; }
.dc-app[data-view="neil"] .neil-sidebar { display: flex; }

.commit-card-nav {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}
.commit-card-nav:hover { background: var(--panel); }
.commit-card-nav.active { background: var(--panel); border-left-color: var(--accent); }
.ccn-hash { font-family: var(--font-mono); font-size: 9.5px; color: var(--accent); margin-bottom: 3px; }
.ccn-msg { font-size: 11px; font-weight: 500; color: var(--text-bright); line-height: 1.35; margin-bottom: 4px; }
.ccn-meta { font-size: 10px; color: var(--text-dim); display: flex; gap: 8px; }
.ccn-files { display: flex; gap: 3px; margin-top: 4px; }
.ccn-file-dot { width: 7px; height: 7px; border-radius: 2px; }

/* ── Main code area ── */
.dc-main {
  grid-area: main;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  position: relative;
}
.neil-diff-heading {
  display: none;
  font-family: var(--font-serif);
  font-size: 15px;
  font-style: italic;
  color: var(--text-bright);
  padding: 11px 16px 10px;
  border-bottom: 1px solid var(--border);
  line-height: 1.4;
  background: var(--surface);
  flex-shrink: 0;
}
.dc-app[data-view="neil"] .neil-diff-heading { display: block; }
.code-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 7px 14px;
  display: flex; align-items: center; gap: 10px;
  flex-shrink: 0;
  position: sticky; top: 0; z-index: 10;
}
.filepath { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-bright); }
.ctx-hash { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); }
.ctx-hash span { color: var(--accent); }

/* Split / code body */
.code-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.code-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  min-width: 0;
}
.pane-scroll {
  flex: 1;
  overflow-y: auto;
}
.code-pane + .code-pane {
  border-left: 1px solid var(--border);
  display: none;
}
.split-active .code-pane + .code-pane { display: flex; }
/* 60/40 split ratio */
.code-pane:first-child { flex: 3; }
.code-pane:last-child  { flex: 2; }

/* Split pane header */
.split-pane-header {
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  padding: 4px 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  display: none;
  flex-shrink: 0;
}
.split-active .split-pane-header { display: block; }

/* Auto-split notice */
.auto-split-notice {
  position: absolute;
  top: 52px; left: 50%; transform: translateX(-50%);
  background: var(--accent-bg);
  border: 1px solid var(--accent-glow);
  border-radius: 5px;
  padding: 5px 12px;
  font-size: 10.5px; color: var(--accent); font-weight: 600;
  z-index: 40;
  opacity: 0; transition: opacity 0.3s;
  pointer-events: none;
  white-space: nowrap;
}
.auto-split-notice.show { opacity: 1; }

/* Diff table */
.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 300;
  line-height: 1.75rem;
  padding-bottom: 40px;
}
.diff-line { opacity: 0; transition: opacity 0.18s ease, background 0.25s, box-shadow 0.25s; }
.diff-line.ctx { opacity: 0.32; }
.diff-line.visible { opacity: 1; }
.diff-line.add-lo.visible { box-shadow: inset 3px 0 0 var(--risk-lo); }
.diff-line.add-md.visible { box-shadow: inset 3px 0 0 var(--risk-md); }
.diff-line.add-hi.visible { box-shadow: inset 3px 0 0 var(--risk-hi); }
.diff-line.del { background: var(--risk-hi-bg); opacity: 0.35 !important; box-shadow: inset 3px 0 0 rgba(207,34,46,0.3); text-decoration: line-through; }

/* Flash animations for newly visible lines */
@keyframes arL { 0%{opacity:0;background:rgba(26,127,55,.32);box-shadow:inset 3px 0 0 var(--risk-lo),0 0 16px var(--risk-lo-gl)}50%{opacity:1}100%{background:var(--risk-lo-bg);box-shadow:inset 3px 0 0 var(--risk-lo)} }
@keyframes arM { 0%{opacity:0;background:rgba(154,103,0,.36);box-shadow:inset 3px 0 0 var(--risk-md),0 0 16px var(--risk-md-gl)}50%{opacity:1}100%{background:var(--risk-md-bg);box-shadow:inset 3px 0 0 var(--risk-md)} }
@keyframes arH { 0%{opacity:0;background:rgba(207,34,46,.38);box-shadow:inset 3px 0 0 var(--risk-hi),0 0 22px var(--risk-hi-gl)}50%{opacity:1}100%{background:var(--risk-hi-bg);box-shadow:inset 3px 0 0 var(--risk-hi)} }
.fl-lo { animation: arL .55s ease forwards; }
.fl-md { animation: arM .55s ease forwards; }
.fl-hi { animation: arH .65s ease forwards; }

.td-n { width: 36px; padding: 0 8px 0 0; text-align: right; font-size: 9.5px; color: var(--text-dim); opacity: .45; vertical-align: top; border-right: 1px solid var(--border); user-select: none; }
.td-g { width: 16px; text-align: center; vertical-align: top; font-size: 10px; user-select: none; }
.td-g.lo { color: var(--risk-lo); }
.td-g.md { color: var(--risk-md); }
.td-g.hi { color: var(--risk-hi); }
.td-c { padding: 0 16px 0 6px; white-space: pre; vertical-align: top; width: 100%; }
.chunk-sep td { padding: 4px 0; border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border); }
.chunk-lbl { padding: 2px 12px; font-size: 9.5px; color: var(--text-dim); font-style: italic; }

/* Neil view diff line tints */
.dc-app[data-view="neil"] .diff-line.add-lo { background: rgba(22,101,52,0.05); }
.dc-app[data-view="neil"] .diff-line.add-md { background: rgba(146,64,14,0.05); }
.dc-app[data-view="neil"] .diff-line.add-hi { background: rgba(185,28,28,0.05); }

/* Toasts */
.dw-toast {
  position: absolute;
  top: 52px; right: 14px;
  background: rgba(207,34,46,0.12);
  border: 1px solid var(--risk-hi-gl);
  border-radius: 6px;
  padding: 8px 12px;
  z-index: 30;
  opacity: 0; transform: translateX(6px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: none;
  max-width: 220px;
}
.dw-toast.show { opacity: 1; transform: none; }
.dw-title { font-size: 10.5px; font-weight: 700; color: var(--risk-hi-d); margin-bottom: 3px; letter-spacing: 0.03em; }
.dw-body  { font-size: 10px; color: var(--text); line-height: 1.4; }

.neil-toast {
  position: absolute;
  top: 52px; right: 14px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-glow);
  border-radius: 6px;
  padding: 8px 12px;
  z-index: 30;
  opacity: 0; transform: translateX(6px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: none;
  max-width: 220px;
}
.neil-toast.show { opacity: 1; transform: none; }
.nt-title { font-size: 10.5px; font-weight: 700; color: var(--accent); margin-bottom: 3px; }
.nt-body  { font-size: 10px; color: var(--text); line-height: 1.4; }

/* ── Timeline ── */
.dc-timeline {
  grid-area: timeline;
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 48px 1fr 210px;
  min-height: 0;
}
.tl-ctrl {
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 6px;
}
.play-btn {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 14px var(--accent-glow);
  transition: transform 0.12s, box-shadow 0.12s;
}
.play-btn:hover { transform: scale(1.08); box-shadow: 0 0 22px rgba(79,110,247,.6); }
.play-icon {
  width: 0; height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 9px solid white;
  margin-left: 2px;
}
.play-btn.playing .play-icon {
  width: 8px; height: 10px; border: none;
  border-left: 2.5px solid white; border-right: 2.5px solid white;
  margin-left: 0;
}
.tl-hint { font-size: 8.5px; color: var(--text-dim); text-align: center; font-family: var(--font-mono); line-height: 1.5; }

/* Tracks */
.tl-tracks {
  display: flex; flex-direction: column;
  padding: 8px 14px 6px;
  gap: 2px;
  position: relative;
}

/* Lanes */
.lanes { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
.lane { display: flex; align-items: center; gap: 6px; height: 14px; cursor: pointer; }
.lane-name { font-family: var(--font-mono); font-size: 9px; color: var(--text-dim); width: 118px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.2s; }
.lane.active .lane-name { color: var(--text-bright); }
.lane-track { flex: 1; height: 100%; background: var(--panel); border-radius: 3px; position: relative; }
.act-block {
  position: absolute; height: 14px; border-radius: 2px; top: 0;
  transform: translateX(-50%);
  opacity: 0.14;
  transition: opacity 0.28s, box-shadow 0.28s;
}
.act-block.reached { opacity: 1; }
.act-block.is-current { box-shadow: 0 0 8px currentColor; }
.ab-lo { background: var(--risk-lo); color: var(--risk-lo); }
.ab-md { background: var(--risk-md); color: var(--risk-md); }
.ab-hi { background: var(--risk-hi); color: var(--risk-hi); }

/* Dangerous window stripe */
.dw-stripe {
  position: absolute;
  top: 0; bottom: 0;
  background: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(207,34,46,0.12) 3px, rgba(207,34,46,0.12) 6px);
  border-left: 1px solid var(--risk-hi-gl);
  border-right: 1px solid var(--risk-hi-gl);
  pointer-events: none;
  z-index: 1;
  opacity: 0;
  transition: opacity 0.4s;
}
.dw-stripe.show { opacity: 1; }
.dw-stripe-label {
  position: absolute;
  bottom: -1px; left: 50%;
  transform: translateX(-50%);
  font-size: 8px; font-weight: 700; letter-spacing: 0.06em;
  color: var(--risk-hi-d);
  white-space: nowrap;
  background: var(--surface);
  padding: 0 4px;
}

@keyframes dwResolve {
  0%   { background: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(207,34,46,0.12) 3px, rgba(207,34,46,0.12) 6px); border-color: var(--risk-hi-gl); }
  20%  { background: rgba(26,127,55,0.22); border-color: var(--risk-lo); }
  100% { background: rgba(26,127,55,0); border-color: transparent; opacity: 0; }
}
.dw-stripe.dw-resolved { animation: dwResolve 1.6s ease-out forwards; }

/* Sparkline */
.spk-row { display: flex; align-items: flex-end; gap: 6px; height: 22px; margin-bottom: 4px; }
.spk-lbl { font-size: 8px; color: var(--text-dim); font-family: var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; width: 118px; flex-shrink: 0; text-align: right; padding-right: 6px; display: flex; align-items: flex-end; padding-bottom: 1px; }
.spk-wrap { flex: 1; height: 22px; position: relative; }
#spkSvg { width: 100%; height: 100%; overflow: visible; }

/* Slider / pips */
.slider-sec { display: flex; flex-direction: column; gap: 3px; }
.pip-row { position: relative; height: 18px; margin-left: 124px; }
.pip { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; transform: translateX(-50%); cursor: pointer; z-index: 2; }
.pip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--panel); border: 2px solid var(--border-hi); transition: background 0.2s, border-color 0.2s, box-shadow 0.2s; }
.pip.reached .pip-dot { background: var(--accent); border-color: var(--accent); }
.pip.current .pip-dot { background: white; border-color: white; box-shadow: 0 0 8px rgba(255,255,255,.5); }
.pip-lbl { font-family: var(--font-mono); font-size: 8px; color: var(--text-dim); white-space: nowrap; transition: color 0.2s; }
.pip.reached .pip-lbl { color: var(--text); }

.dw-pip-zone {
  position: absolute;
  top: 2px; bottom: 2px;
  background: rgba(207,34,46,0.08);
  border: 1px dashed var(--risk-hi-gl);
  border-radius: 2px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s;
  z-index: 1;
}
.dw-pip-zone.show { opacity: 1; }

.slider-row { display: flex; align-items: center; gap: 6px; }
.sl-lbl { font-family: var(--font-mono); font-size: 8.5px; color: var(--text-dim); width: 118px; flex-shrink: 0; text-align: right; padding-right: 6px; }
.step-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  width: 22px; height: 22px; border-radius: 3px; cursor: pointer; font-size: 9px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s; padding: 0; line-height: 1;
}
.step-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.step-btn:disabled { opacity: 0.25; cursor: default; }

input[type=range] {
  -webkit-appearance: none; flex: 1; height: 3px; border-radius: 2px;
  background: var(--border-hi); cursor: pointer; outline: none;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: white; border: 2px solid var(--accent);
  box-shadow: 0 0 8px var(--accent-glow); margin-top: -5.5px;
  cursor: grab; transition: box-shadow .15s, transform .1s;
}
input[type=range]:active::-webkit-slider-thumb { cursor: grabbing; transform: scale(1.2); }

/* Timeline info */
.tl-info {
  border-left: 1px solid var(--border);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  overflow: hidden;
}
.ci-card {
  background: var(--panel); border: 1px solid var(--border-hi);
  border-radius: 5px; padding: 7px 9px;
  display: flex; flex-direction: column; gap: 3px;
}
.ci-hash { font-family: var(--font-mono); font-size: 9px; color: var(--accent); }
.ci-msg  { font-size: 11px; font-weight: 500; color: var(--text-bright); line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ci-meta { font-size: 10px; color: var(--text-dim); }

.touch-list { display: flex; flex-direction: column; gap: 3px; }
.touch-lbl { font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); }
.touch-item { display: flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 9.5px; color: var(--text); }
.touch-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.touch-stat { margin-left: auto; font-size: 9px; color: var(--text-dim); }

/* Free tier banner */
.free-banner {
  grid-column: 1 / -1;
  background: var(--panel);
  border-top: 1px solid var(--border);
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--text-dim);
}
.upgrade-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  margin-left: auto;
}
.upgrade-link:hover { text-decoration: underline; }

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 2px; }

/* Reduce motion */
@media (prefers-reduced-motion: reduce) {
  .fl-hi, .fl-md, .fl-lo { animation: none; }
  .diff-line { transition: none; }
}
`

// ── Render diff ───────────────────────────────────────────────────────────
function renderDiff(filepath, tableEl) {
  if (!tableEl) return
  const lines = _frameModel[filepath] ?? []
  tableEl.innerHTML = ''
  let lastCommit = -1
  lines.forEach(line => {
    if (line.type === 'add' && line.commitIdx !== lastCommit && line.commitIdx > 0) {
      const sep = document.createElement('tr')
      sep.className = 'chunk-sep'
      const c = _commits[line.commitIdx]
      sep.innerHTML = `<td colspan="3" class="chunk-lbl">@@ ${c?.sha.slice(0, 7) ?? ''} — ${esc(c?.message?.split('\n')[0]?.slice(0, 60) ?? '')}</td>`
      tableEl.appendChild(sep)
      lastCommit = line.commitIdx
    }
    const tr  = document.createElement('tr')
    const t   = line.type
    tr.className     = `diff-line ${t === 'add' ? `add-${line.risk}` : t}`
    tr.dataset.commit = line.commitIdx
    tr.dataset.type   = t
    tr.dataset.risk   = line.risk ?? 'lo'
    const glyph = t === 'add' ? '+' : t === 'del' ? '−' : ' '
    const gc    = t !== 'ctx' ? line.risk : ''
    tr.innerHTML = `<td class="td-n">${line.lineNum}</td><td class="td-g ${gc}">${glyph}</td><td class="td-c">${esc(line.content)}</td>`
    tableEl.appendChild(tr)
  })
}

// ── Diff visibility ───────────────────────────────────────────────────────
function applyDiffVisibility(ci, animate, tableEl, filepath) {
  if (!tableEl) return
  tableEl.querySelectorAll('.diff-line').forEach(tr => {
    const lc   = +tr.dataset.commit
    const type = tr.dataset.type
    if (type === 'ctx') { tr.classList.add('visible'); return }
    const show = ci >= lc
    if (show && !tr.classList.contains('visible')) {
      tr.classList.add('visible')
      if (animate) {
        const r = tr.dataset.risk
        tr.classList.remove('fl-lo', 'fl-md', 'fl-hi')
        void tr.offsetWidth
        tr.classList.add(`fl-${r}`)
        setTimeout(() => tr.classList.remove('fl-lo', 'fl-md', 'fl-hi'), 750)
      }
    } else if (!show) {
      tr.classList.remove('visible', 'fl-lo', 'fl-md', 'fl-hi')
    }
  })
}

// ── Apply state ───────────────────────────────────────────────────────────
function applyState(ci, animate) {
  applyDiffVisibility(ci, animate, _shadow.getElementById('diffTable1'), _curFile)
  const secondFile = _fileKeys[1]
  if (secondFile && _splitOn) applyDiffVisibility(ci, animate, _shadow.getElementById('diffTable2'), secondFile)
  updateCard(ci)
  updateRisk(ci)
  updateLanes(ci)
  updateFileListSparks(ci)
  updateToast(ci, animate)
  updateSplitBtn(ci)
  updateNeilSidebar(ci)
  updateDW(ci)
  const slLbl = _shadow.getElementById('slLbl')
  if (slLbl) slLbl.textContent = ci >= 0 ? `commit ${ci + 1} of ${_commits.length}` : '← drag to replay'
  const prevBtn = _shadow.getElementById('prevBtn')
  const nextBtn = _shadow.getElementById('nextBtn')
  if (prevBtn) prevBtn.disabled = ci <= 0
  if (nextBtn) nextBtn.disabled = ci >= _commits.length - 1
}

// ── Update card ───────────────────────────────────────────────────────────
function updateCard(ci) {
  const c   = _commits[ci]
  const q   = id => _shadow.getElementById(id)
  q('ciHash').textContent   = c ? c.sha.slice(0, 7) : '——'
  q('ciMsg').textContent    = c ? c.message.split('\n')[0].slice(0, 80) : 'Drag the slider to replay'
  q('ciAuthor').textContent = c?.author ?? '——'
  q('ciTime').textContent   = c ? new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '——'
  q('ctxHash').textContent  = c ? c.sha.slice(0, 7) : '—'
  const ndh = q('neilDiffHeading')
  if (ndh) ndh.textContent = c ? `"${c.message.split('\n')[0]}"` : '—'

  // Touch list (files in this commit)
  const tl = q('touchList')
  tl.innerHTML = '<div class="touch-lbl">Files in this commit</div>'
  if (!c) return
  const riskColors = { hi: 'var(--risk-hi-d)', md: 'var(--risk-md-d)', lo: 'var(--risk-lo-d)' }
  c.files.forEach(f => {
    const risk = fileRiskForCommit(f.filename, ci)
    const d    = document.createElement('div')
    d.className = 'touch-item'
    const name = f.filename.split('/').pop()
    d.innerHTML = `<div class="touch-dot" style="background:${riskColors[risk]}"></div><span>${esc(name)}</span><span class="touch-stat">+${f.additions} −${f.deletions}</span>`
    tl.appendChild(d)
  })
}

// ── Update risk breakdown ─────────────────────────────────────────────────
function updateRisk(ci) {
  const lines = _frameModel[_curFile] ?? []
  let hi = 0, md = 0, lo = 0, tot = 0
  lines.forEach(l => {
    if (l.type !== 'add' || l.commitIdx > ci) return
    tot++
    if (l.risk === 'hi') hi++
    else if (l.risk === 'md') md++
    else lo++
  })
  const p  = v => tot ? Math.round(v / tot * 100) : 0
  const hp = p(hi), mp = p(md), lp = p(lo)
  const q  = id => _shadow.getElementById(id)
  q('rb-hi').style.width = hp + '%'; q('rb-hi').style.background = 'var(--risk-hi)'
  q('rb-md').style.width = mp + '%'; q('rb-md').style.background = 'var(--risk-md)'
  q('rb-lo').style.width = lp + '%'; q('rb-lo').style.background = 'var(--risk-lo)'
  q('rp-hi').textContent = hp + '%'
  q('rp-md').textContent = mp + '%'
  q('rp-lo').textContent = lp + '%'
}

// ── Update lanes ──────────────────────────────────────────────────────────
function updateLanes(ci) {
  _shadow.querySelectorAll('.act-block').forEach(b => {
    const bc = +b.dataset.commit
    b.classList.toggle('reached', bc <= ci)
    b.classList.toggle('is-current', bc === ci)
  })
  _shadow.querySelectorAll('.lane').forEach(l =>
    l.classList.toggle('active', l.dataset.filepath === _curFile)
  )
}

// ── Update file list sparks ───────────────────────────────────────────────
function updateFileListSparks(ci) {
  _fileKeys.forEach(filepath => {
    const el = _shadow.getElementById(`sk-${btoa(filepath).slice(0, 20)}`)
    if (!el) return
    const lines     = _frameModel[filepath] ?? []
    const cumAdds   = lines.filter(l => l.type === 'add' && l.commitIdx <= ci).length
    const totalAdds = lines.filter(l => l.type === 'add').length
    const w = totalAdds > 0 && ci >= 0 ? Math.round(cumAdds / totalAdds * 100) : 0
    el.style.width = w + '%'
  })
}

// ── Toast ─────────────────────────────────────────────────────────────────
function updateToast(ci, animate) {
  const dw = _shadow.getElementById('dwToast')
  const nt = _shadow.getElementById('neilToast')
  if (!animate || ci < 0) { dw.classList.remove('show'); nt.classList.remove('show'); return }
  clearTimeout(_toastTimer)

  const c = _commits[ci]
  if (!c) return
  const score = _commitRiskScores[ci] ?? 0

  if (_curView === 'james') {
    nt.classList.remove('show')
    if (score >= 34) {
      const riskLabel = score >= 67 ? 'HIGH RISK' : 'MEDIUM RISK'
      const hiFiles   = c.files
        .filter(f => fileRiskForCommit(f.filename, ci) === 'hi' && (f.additions + f.deletions) > 0)
        .map(f => f.filename.split('/').pop())
      const body = hiFiles.length
        ? `${hiFiles.slice(0, 2).join(', ')}${hiFiles.length > 2 ? ` +${hiFiles.length - 2} more` : ''} — review carefully`
        : `${c.files.filter(f => f.additions + f.deletions > 0).length} files changed in this commit`
      _shadow.getElementById('dwTitle').textContent = `⚠ ${riskLabel} — commit ${ci + 1}`
      _shadow.getElementById('dwBody').textContent  = body
      dw.classList.add('show')
      _toastTimer = setTimeout(() => dw.classList.remove('show'), 3500)
    } else {
      dw.classList.remove('show')
    }
  } else {
    dw.classList.remove('show')
    const fileCount  = c.files.filter(f => f.additions + f.deletions > 0).length
    const totalAdds  = c.files.reduce((s, f) => s + f.additions, 0)
    _shadow.getElementById('ntTitle').textContent = `✓ ${c.message.split('\n')[0].slice(0, 48)}`
    _shadow.getElementById('ntBody').textContent  = `+${totalAdds} lines across ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    nt.classList.add('show')
    _toastTimer = setTimeout(() => nt.classList.remove('show'), 3000)
  }
}

// ── Split button update ───────────────────────────────────────────────────
function updateSplitBtn(ci) {
  const wrap = _shadow.getElementById('splitBtnWrap')
  if (!wrap) return
  const c = _commits[ci]
  if (!c) { wrap.classList.remove('visible'); return }
  const numFiles = c.files.filter(f => f.additions + f.deletions > 0).length
  const notice   = _shadow.getElementById('splitNotice')
  if (notice) notice.textContent = `${numFiles} file${numFiles !== 1 ? 's' : ''} this commit`
  wrap.classList.add('visible')

  // Auto-open split when entering a commit with 2+ high-risk files (once per commit)
  const hiCount = _fileKeys.filter(fp => fileRiskForCommit(fp, ci) === 'hi' &&
    ((_frameModel[fp] ?? []).some(l => l.commitIdx === ci && l.type === 'add'))).length
  if (hiCount >= 2 && !_autoSplit.has(ci) && !_splitOn) {
    _autoSplit.add(ci)
    _splitOn = true
    _shadow.getElementById('codeBody').classList.add('split-active')
    _shadow.getElementById('splitBtn').classList.add('active')
    _shadow.getElementById('splitBtnLabel').textContent = 'Single view'
    const secondFile = _fileKeys[1]
    if (secondFile) {
      renderDiff(secondFile, _shadow.getElementById('diffTable2'))
      applyDiffVisibility(ci, false, _shadow.getElementById('diffTable2'), secondFile)
    }
    const noticeEl = _shadow.getElementById('autoSplitNotice')
    if (noticeEl) {
      noticeEl.classList.add('show')
      clearTimeout(_autoSplitTimer)
      _autoSplitTimer = setTimeout(() => noticeEl.classList.remove('show'), 2600)
    }
  }
}

// ── Neil sidebar ──────────────────────────────────────────────────────────
function updateNeilSidebar(ci) {
  _shadow.querySelectorAll('.commit-card-nav').forEach(card => {
    const i = +card.dataset.cidx
    card.classList.toggle('active', i === ci)
  })
}

// ── Dangerous window ──────────────────────────────────────────────────────
function updateDW(ci) {
  const dw = _dangerousWindows[0]
  if (!dw) return
  const stripe = _shadow.getElementById('dwStripe')
  const label  = _shadow.getElementById('dwLabel')
  const pip    = _shadow.getElementById('dwPipZone')
  if (!stripe) return

  if (ci === dw.closedAtCommit && _prevCommit === dw.openAtCommit) {
    // Resolution flash
    label.textContent = '✓ Window closed'
    label.style.color = 'var(--risk-lo-d)'
    stripe.classList.add('show')
    stripe.classList.remove('dw-resolved')
    void stripe.offsetWidth
    stripe.classList.add('dw-resolved')
    setTimeout(() => {
      stripe.classList.remove('show', 'dw-resolved')
      label.textContent = '⚠ ' + (dw.description?.slice(0, 40) ?? 'auth gap')
      label.style.color = ''
    }, 1700)
  } else if (ci >= dw.openAtCommit && (dw.closedAtCommit === null || ci < dw.closedAtCommit)) {
    stripe.classList.add('show')
    label.textContent = '⚠ ' + (dw.description?.slice(0, 40) ?? 'auth gap')
    label.style.color = ''
  } else {
    stripe.classList.remove('show', 'dw-resolved')
  }

  if (pip) {
    const open   = _cpcts[dw.openAtCommit]   ?? 0
    const closed = dw.closedAtCommit !== null ? (_cpcts[dw.closedAtCommit] ?? 100) : 100
    pip.style.left  = open + '%'
    pip.style.width = (closed - open) + '%'
    pip.classList.toggle('show', ci >= dw.openAtCommit && ci < (dw.closedAtCommit ?? Infinity))
  }
}

// ── Slider ────────────────────────────────────────────────────────────────
function sliderToCommit(v) {
  if (v < 1) return -1
  const n = _commits.length
  if (n === 0) return -1
  if (n === 1) return v >= 50 ? 0 : -1
  for (let i = 0; i < n - 1; i++) {
    if (v <= (_cpcts[i] + _cpcts[i + 1]) / 2) return i
  }
  return n - 1
}

function jumpTo(i) {
  const sv = _cpcts[i] ?? 0
  _shadow.getElementById('slider').value = sv
  onSlide(sv)
}

function onSlide(v) {
  _sliderVal = v
  const nc  = sliderToCommit(v)
  const fwd = nc > _curCommit
  if (nc !== _curCommit) {
    _prevCommit = _curCommit
    _curCommit  = nc
    applyState(nc, fwd)
  }
  updateSliderTrack(v)
  updateSparkline(v)
  updatePips(nc)
}

function updateSliderTrack(v) {
  const sl = _shadow.getElementById('slider')
  if (!sl) return
  const riskColor = r => r >= 67 ? 'var(--risk-hi-d)' : r >= 34 ? 'var(--risk-md-d)' : 'var(--risk-lo-d)'
  const n  = _commits.length
  let bg
  if (n <= 1) {
    const col = riskColor(_commitRiskScores[0] ?? 0)
    bg = `linear-gradient(to right, ${col} 0%, ${col} 100%)`
  } else {
    const stops = []
    _commits.forEach((_, i) => {
      const x   = _cpcts[i]
      const col = riskColor(_commitRiskScores[i])
      const mid = i > 0 ? (_cpcts[i - 1] + x) / 2 : 0
      if (i > 0) stops.push(`${col} ${mid}%`)
      stops.push(`${col} ${x}%`)
    })
    stops.push(`${riskColor(_commitRiskScores[n - 1])} 100%`)
    bg = `linear-gradient(to right, ${stops.join(', ')})`
  }
  sl.style.background       = bg
  sl.style.webkitMaskImage  = `linear-gradient(to right, black ${v}%, rgba(0,0,0,0.15) ${v}%)`
  sl.style.maskImage        = sl.style.webkitMaskImage
}

function updatePips(ci) {
  _shadow.querySelectorAll('.pip').forEach(p => {
    const i = +p.dataset.idx
    p.classList.toggle('reached', i <= ci)
    p.classList.toggle('current', i === ci)
  })
}

function updateSparkline(pct) {
  const rect = _shadow.getElementById('spkRect')
  const line = _shadow.getElementById('spkLine')
  if (rect) rect.setAttribute('width', pct)
  if (line) { line.setAttribute('x1', pct + '%'); line.setAttribute('x2', pct + '%') }
}

// ── File select ───────────────────────────────────────────────────────────
function selectFile(filepath) {
  _curFile = filepath
  _shadow.querySelectorAll('.file-entry').forEach(e => {
    e.classList.toggle('active', e.dataset.filepath === filepath)
  })
  const fpEl = _shadow.getElementById('filepath')
  if (fpEl) fpEl.textContent = filepath
  const p1Hdr = _shadow.getElementById('pane1Hdr')
  if (p1Hdr) p1Hdr.textContent = shortPath(filepath)
  renderDiff(filepath, _shadow.getElementById('diffTable1'))
  applyDiffVisibility(_curCommit, false, _shadow.getElementById('diffTable1'), filepath)
  updateRisk(_curCommit)
  buildLanes()
}

// ── Split view ────────────────────────────────────────────────────────────
function toggleSplit() {
  _splitOn = !_splitOn
  _shadow.getElementById('codeBody').classList.toggle('split-active', _splitOn)
  const btn = _shadow.getElementById('splitBtn')
  if (btn) btn.classList.toggle('active', _splitOn)
  const lbl = _shadow.getElementById('splitBtnLabel')
  if (lbl) lbl.textContent = _splitOn ? 'Single view' : 'Split view'
  if (_splitOn) {
    const secondFile = _fileKeys[1]
    if (secondFile) {
      renderDiff(secondFile, _shadow.getElementById('diffTable2'))
      applyDiffVisibility(_curCommit, false, _shadow.getElementById('diffTable2'), secondFile)
    }
  }
}

// ── View toggle ───────────────────────────────────────────────────────────
function setView(v) {
  _curView = v
  const root = _shadow.querySelector('.dc-app')
  if (root) root.setAttribute('data-view', v)
  const j = _shadow.getElementById('btnJames')
  const n = _shadow.getElementById('btnNeil')
  if (j) j.classList.toggle('active', v === 'james')
  if (n) n.classList.toggle('active', v === 'neil')
  updateToast(_curCommit, false)
}

// ── Playback ──────────────────────────────────────────────────────────────
function initEngine() {
  const boundaries = _cpcts.map(p => p / 100)
  _engine = new AnimationEngine({
    speed:      0.000125,
    boundaries,
    onTick: (pos) => {
      const v  = pos * 100
      _sliderVal = v
      const sl = _shadow.getElementById('slider')
      if (sl) sl.value = v
      const nc  = sliderToCommit(v)
      const fwd = nc > _curCommit
      if (nc !== _curCommit) {
        _prevCommit = _curCommit
        _curCommit  = nc
        applyState(nc, fwd)
      }
      updateSliderTrack(v)
      updateSparkline(v)
      updatePips(nc)
    },
    onComplete: () => {
      const btn = _shadow.getElementById('playBtn')
      if (btn) btn.classList.remove('playing')
    },
  })
}

function stepCommit(dir) {
  const next = Math.min(Math.max(_curCommit + dir, 0), _commits.length - 1)
  if (next !== _curCommit || _curCommit < 0) jumpTo(Math.max(next, 0))
}

// ── Interaction wiring ────────────────────────────────────────────────────
function wireAll() {
  const q = id => _shadow.getElementById(id)

  q('slider').addEventListener('input', e => onSlide(+e.target.value))

  q('playBtn').addEventListener('click', () => {
    _engine.toggle()
    q('playBtn').classList.toggle('playing', _engine.playing)
    if (_engine.playing && _sliderVal >= 100) {
      _sliderVal = 0
      q('slider').value = 0
      onSlide(0)
    }
  })

  q('splitBtn').addEventListener('click', toggleSplit)
  q('btnJames').addEventListener('click', () => setView('james'))
  q('btnNeil').addEventListener('click', () => setView('neil'))
  q('prevBtn').addEventListener('click', () => stepCommit(-1))
  q('nextBtn').addEventListener('click', () => stepCommit(1))

  // TODO Phase 2: track listener ref for SPA navigation cleanup
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return
    if (e.key === ' ')          { e.preventDefault(); q('playBtn').click() }
    if (e.key === 'ArrowRight') stepCommit(1)
    if (e.key === 'ArrowLeft')  stepCommit(-1)
    if (e.key === 's')          toggleSplit()
    if (e.key === 'r')          setView(_curView === 'james' ? 'neil' : 'james')
  })
}

// ── Build file list (James sidebar) ──────────────────────────────────────
function buildFileList() {
  const el = _shadow.getElementById('fileList')
  if (!el) return
  el.innerHTML = ''
  _fileKeys.forEach((filepath, idx) => {
    const lines     = _frameModel[filepath] ?? []
    const totAdds   = lines.filter(l => l.type === 'add').length
    const totDels   = lines.filter(l => l.type === 'del').length
    const risks     = lines.filter(l => l.type === 'add').map(l => l.risk)
    const maxRisk   = risks.includes('hi') ? 'hi' : risks.includes('md') ? 'md' : 'lo'
    const sparkId   = `sk-${btoa(filepath).slice(0, 20)}`
    const div       = document.createElement('div')
    div.className   = `file-entry${idx === 0 ? ' active' : ''}`
    div.dataset.filepath = filepath
    div.dataset.testid   = 'file-item'
    div.setAttribute('data-testid', 'file-item')
    div.addEventListener('click', () => selectFile(filepath))
    div.innerHTML = `
      <div class="fe-row">
        <div class="fe-dot fe-${maxRisk}"></div>
        <span class="fe-name">${esc(shortPath(filepath))}</span>
        <span class="fe-stat">+${totAdds} −${totDels}</span>
      </div>
      <div class="fe-spark"><div class="fe-spark-fill" id="${sparkId}" style="width:0%;background:var(--risk-${maxRisk})"></div></div>
      <div class="fe-cochange" id="cc-${sparkId}"></div>`
    el.appendChild(div)
  })
  // Set initial filepath display
  const fpEl = _shadow.getElementById('filepath')
  if (fpEl) fpEl.textContent = _fileKeys[0] ?? ''
  const p1Hdr = _shadow.getElementById('pane1Hdr')
  if (p1Hdr) p1Hdr.textContent = _fileKeys[0] ? shortPath(_fileKeys[0]) : ''
  const p2Hdr = _shadow.getElementById('pane2Hdr')
  if (p2Hdr) p2Hdr.textContent = _fileKeys[1] ? shortPath(_fileKeys[1]) : ''
}

// ── Build Neil sidebar ────────────────────────────────────────────────────
function buildNeilSidebar() {
  const el = _shadow.getElementById('neilCommitList')
  if (!el) return
  el.innerHTML = ''
  _commits.forEach((c, i) => {
    const div       = document.createElement('div')
    div.className   = 'commit-card-nav'
    div.dataset.cidx = i
    div.setAttribute('data-testid', 'commit-card-nav')
    div.addEventListener('click', () => jumpTo(i))
    const fileDots  = c.files
      .filter(f => f.additions + f.deletions > 0)
      .slice(0, 6)
      .map(f => {
        const risk = fileRiskForCommit(f.filename, i)
        const name = f.filename.split('/').pop()
        return `<div class="ccn-file-dot" style="background:var(--risk-${risk})" title="${esc(name)}"></div>`
      }).join('')
    div.innerHTML = `
      <div class="ccn-hash">${esc(c.sha.slice(0, 7))}</div>
      <div class="ccn-msg">${esc(c.message.split('\n')[0].slice(0, 72))}</div>
      <div class="ccn-meta"><span>${esc(c.author)}</span><span>${new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="ccn-files">${fileDots}</div>`
    el.appendChild(div)
  })
}

// ── Build lanes ───────────────────────────────────────────────────────────
function buildLanes() {
  const el = _shadow.getElementById('lanesEl')
  if (!el) return
  el.innerHTML = ''
  const MAX_LINES = 12
  _fileKeys.forEach(filepath => {
    const lane         = document.createElement('div')
    lane.className     = `lane${filepath === _curFile ? ' active' : ''}`
    lane.dataset.filepath = filepath
    lane.addEventListener('click', () => selectFile(filepath))

    const nameEl       = document.createElement('div')
    nameEl.className   = 'lane-name'
    nameEl.textContent = shortPath(filepath)

    const track        = document.createElement('div')
    track.className    = 'lane-track'

    _commits.forEach((c, ci) => {
      const fileInfo = c.files.find(f => f.filename === filepath)
      const adds     = fileInfo?.additions ?? 0
      const dels     = fileInfo?.deletions ?? 0
      const risk     = fileRiskForCommit(filepath, ci)
      const lines    = adds + dels
      if (lines === 0) return
      const w        = Math.max(8, Math.round(lines / MAX_LINES * 42))
      const b        = document.createElement('div')
      b.className    = `act-block ab-${risk}`
      b.dataset.commit = ci
      b.dataset.filepath = filepath
      b.style.width  = w + 'px'
      b.style.left   = _cpcts[ci] + '%'
      track.appendChild(b)
    })

    lane.appendChild(nameEl)
    lane.appendChild(track)
    el.appendChild(lane)
  })
}

// ── Build pips ────────────────────────────────────────────────────────────
function buildPips() {
  const row = _shadow.getElementById('pipRow')
  if (!row) return
  Array.from(row.querySelectorAll('.pip')).forEach(p => p.remove())
  _commits.forEach((c, i) => {
    const pip       = document.createElement('div')
    pip.className   = 'pip'
    pip.style.left  = _cpcts[i] + '%'
    pip.dataset.idx = i
    pip.innerHTML   = `<div class="pip-dot"></div><div class="pip-lbl">${esc(c.sha.slice(0, 7))}</div>`
    pip.addEventListener('click', () => jumpTo(i))
    row.appendChild(pip)
  })

  // Position dw-pip-zone from first dangerousWindow if present
  const dw  = _dangerousWindows[0]
  const dz  = _shadow.getElementById('dwPipZone')
  if (dw && dz) {
    const open   = _cpcts[dw.openAtCommit]   ?? 0
    const closed = dw.closedAtCommit !== null ? (_cpcts[dw.closedAtCommit] ?? 100) : 100
    dz.style.left  = open + '%'
    dz.style.width = (closed - open) + '%'
  }
}

// ── Build sparkline ───────────────────────────────────────────────────────
function buildSparkline() {
  const dim  = _shadow.getElementById('spkDim')
  const fill = _shadow.getElementById('spkFill')
  if (!dim || !fill) return
  dim.innerHTML = fill.innerHTML = ''
  const SPK_H = 22
  const bw    = 5
  _commits.forEach((_, i) => {
    const x     = _cpcts[i]
    const score = _commitRiskScores[i] ?? 0
    const h     = (score / 100) * SPK_H
    const y     = SPK_H - h
    const col   = score >= 67 ? 'var(--risk-hi-d)' : score >= 34 ? 'var(--risk-md-d)' : 'var(--risk-lo-d)'
    ;[dim, fill].forEach((g, gi) => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      r.setAttribute('x', `calc(${x}% - ${bw / 2}px)`)
      r.setAttribute('y', y)
      r.setAttribute('height', h)
      r.setAttribute('width', bw + '%')
      r.setAttribute('fill', col)
      r.setAttribute('opacity', gi === 0 ? '0.14' : '0.85')
      r.setAttribute('rx', '1')
      g.appendChild(r)
    })
  })
}

// ── Free tier banner ──────────────────────────────────────────────────────
function showFreeBanner(shownCount, totalCount) {
  const banner = _shadow.getElementById('freeBanner')
  const text   = _shadow.getElementById('freeBannerText')
  if (!banner || !text) return
  text.textContent = `Showing ${shownCount} of ${totalCount} commits (free tier). `
  banner.style.display = 'flex'
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the highest risk level for a given file at a specific commit index.
 * Looks at 'add' lines in _frameModel for that commit.
 */
function fileRiskForCommit(filepath, ci) {
  const lines = (_frameModel[filepath] ?? []).filter(l => l.commitIdx === ci && l.type === 'add')
  if (!lines.length) return 'lo'
  if (lines.some(l => l.risk === 'hi')) return 'hi'
  if (lines.some(l => l.risk === 'md')) return 'md'
  return 'lo'
}

/** Returns last 2 path segments for display: "auth/middleware.js" */
function shortPath(filepath) {
  const parts = filepath.split('/')
  return parts.length <= 2 ? filepath : parts.slice(-2).join('/')
}

/** Escape HTML special characters */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
