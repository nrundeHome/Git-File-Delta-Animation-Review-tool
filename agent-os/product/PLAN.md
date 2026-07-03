# DiffCast — Product & Engineering Roadmap
> Last updated: 2026-07-03
> Full market analysis: `docs/MARKET-ANALYSIS.md`

**One-line pitch:** A browser extension that replays a pull request as a time-scrubbed animation, coloring changes by risk so reviewers feel where the danger is before reading a single line of diff.

**10-word positioning:** "See how your PR was built, not just what it changed."

**Primary users:** James Owen (reviewer — risk-first) · Neil Runde (author — narrative-first). Two views, same data, zero author workflow change required.

**Macro tailwind:** AI agents now produce 2,000-line diffs across 40 files in seconds. LinearB confirms AI-generated PRs wait 4.6× longer before human review. The review burden is *increasing*. Every tool that exists makes static inspection marginally better. DiffCast replaces inspection with replay.

---

## Phase 0 — Prototype ✅ COMPLETE
**`experiments/01-diff-animation/index.html`**

Working interactive prototype demonstrating:
- Commit-by-commit animated diff with risk coloring (green/amber/red glow)
- Multi-file activity lanes in timeline (DAW-style)
- Risk sparkline showing aggregate risk per commit
- Dangerous window stripe between auth-added and RBAC-added commits
- Reviewer view (dark/clinical) ↔ Author view (warm/editorial) toggle
- Split-pane view for commits touching multiple files
- GitHub chrome simulation showing extension tab injection
- Co-change pills, story arc SVG, squash hints, commit toast notifications

---

## Phase 0.5 — Prototype iteration (THIS WEEK)
**Goal:** Resolve the four UX questions that block confidence in Phase 1.
**Not:** Extension manifest, real API calls, payment.
**Output:** Updated `experiments/01-diff-animation/index.html` with fixes below.

### Fix 1 — Split pane: auto-trigger, not manual
**Problem:** A button users don't know exists won't be found.
**Fix:** When current commit has high-risk changes (risk='hi') in 2+ files, split opens automatically. When commit touches only one file, it collapses. The button remains as an override. Remove the "Split view" notice from the toolbar — replace with a subtle pulse on the pane border when auto-splitting.
**Acceptance:** No user should need to discover the split button to experience split view on a multi-file high-risk commit.

### Fix 2 — Split pane: 60/40 ratio, not 50/50
**Problem:** On 1280px width, 50/50 gives ~520px per pane — too narrow for most code.
**Fix:** Primary file gets 60% width, secondary gets 40%. When secondary has more changes than primary, swap ratio. Make it responsive: below 1100px, stack vertically instead of horizontally.
**Acceptance:** Code in both panes is readable at 13" MacBook resolution (1280×800) without horizontal scrolling on 80-char lines.

### Fix 3 — Author view: commit message as primary, code as evidence
**Problem:** Neil's view still reads as a diff with a different color palette. The code panel looks identical in both views.
**Fix:** In Author view, render a large serif (`Lora`) commit message block above the diff table for each commit group — styled like a section heading in a document. Collapse unchanged files by default (show a "3 files unchanged, click to expand" summary). The diff is evidence; the message is the story.
**Acceptance:** James switching from Reviewer to Author view should feel like switching from a security scanner to a book.

### Fix 4 — Dangerous window: show resolution moment
**Problem:** The red stripe appears when the window opens, but there's no satisfying "fixed" signal when it closes.
**Fix:** When the slider crosses from commit 1 → commit 2 (RBAC added), animate the stripe from red → green briefly, then fade it out with a "✓ Window closed" label. Same technique as the arrival glow on individual lines.
**Acceptance:** The moment of safety should feel as emotionally clear as the moment of danger.

### Fix 5 — PR list risk badge (add to prototype)
**Problem:** The prototype only shows DiffCast value when a user actively opens a PR. The strongest ambient value proposition is not shown.
**Fix:** Add a second HTML page to the experiment: `experiments/01-diff-animation/pr-list.html`. Mock a GitHub PR list view with 6 PRs. Inject colored risk score pills (`🔴 84`, `🟡 41`, `🟢 18`) next to each PR title. Show a "before/after" toggle removing/showing the pills.
**Acceptance:** Anyone who sees the PR list mockup should immediately say "I want that on my PR list."

### Fix 6 — Waitlist page scaffold
**Problem:** No place to capture email before launch. Product Hunt and HN moments are wasted without a warm list.
**Fix:** Create `experiments/02-landing/index.html` — single-page landing with the demo GIF area, three-line value prop, and an email input. No backend needed: use a Tally.so or Mailchimp embedded form.
**Acceptance:** Shareable URL for collecting interest before Chrome Web Store submission.

---

## Phase 1 — Chrome Extension scaffold (Weeks 3–5)
**Goal:** Loadable extension that injects DiffCast tab on `github.com/*/pull/*` with mock data. James installs it and sees the UI on a real PR page.
**Not:** Real GitHub API calls, payment, team features.
**Output:** Loadable `dist/` folder that works in Chrome with mock data injected.

### Technical decisions (locked — see `docs/adr/`)
- **ADR-001:** Manifest V3 + Service Worker for all API calls
- **ADR-002:** Shadow DOM for UI isolation (closed mode)
- **ADR-003:** Vanilla JS, no framework, bundle < 120KB
- **ADR-004:** PAT auth for v1, OAuth via Cloudflare Worker in v2

---

### Task 1.1 — Common CSS foundation
**Files:** `src/styles/variables.css`, `src/styles/risk-colors.css`, `src/styles/animation.css`
**Status:** variables.css + risk-colors.css created. animation.css pending.

`animation.css` needs:
- Slider track reveal animation
- Diff line flash-in keyframes (already in risk-colors.css)
- Play button state transitions
- Toast slide-in/out
- `@media (prefers-reduced-motion: reduce)` overrides for everything

---

### Task 1.2 — `src/diffcast/app.js` — Shadow DOM app shell
**Status:** Not started. This is the critical path blocker for Phase 1.

`content.js` already does: URL detection, tab injection, Shadow DOM creation, `LOAD_PR` message dispatch, dynamic import of `app.js`.

`app.js` must export: `mountApp(shadow, prData, { owner, repo, prNumber })`

`prData` shape (from `background.js` LOAD_PR response):
```js
{
  commits:          Array<{ sha, message, author, date, files }>,
  frameModel:       Object<filepath, DiffLine[]>,
  dangerousWindows: Array<{ openAtCommit, closedAtCommit, description }>,
  commitRiskScores: number[],       // one per commit, 0–100
  truncated:        boolean,        // free tier truncation
  totalCommits:     number,
  tier:             'free'|'pro'|'team',
}
```

`app.js` implementation plan:
1. Inject fonts (link tag to Google Fonts) inside the shadow root
2. Import and inline `variables.css` + `risk-colors.css` (Vite will bundle CSS via `?inline`)
3. Render the full DiffCast UI — direct port of the prototype from `experiments/01-diff-animation/index.html` adapted to use `prData` instead of hardcoded COMMITS
4. Wire the slider: position → `commitRiskScores[i]` → color, `frameModel[filepath]` → diff lines
5. Wire the file selector: click → re-render diff table from `frameModel[selectedFile]`
6. Wire playback: `AnimationEngine` from `src/utils/animationEngine.js`
7. Wire Reviewer/Author toggle
8. Dangerous window stripe: from `dangerousWindows[0]` position
9. Free tier banner: if `truncated === true`, show "Showing 5 of N commits — upgrade to Pro"

Key constraint: The shadow root uses `mode: 'closed'` — no external CSS can leak in. All styles must be injected as `<style>` tags inside the shadow.

---

### Task 1.3 — Mock data fallback in `background.js`
**Status:** Not started.

When no GitHub token is set, `LOAD_PR` currently throws. Add a mock-data path:
```js
// In handleMessage, before calling loadPR:
if (!token && msg.prNumber === 0) return MOCK_PR_DATA  // dev mode
```

Include `MOCK_PR_DATA` as a constant that mirrors the fixture from `experiments/01-diff-animation/index.html` (the JWT/RBAC scenario) so the extension is testable without a token.

---

### Task 1.4 — Build pipeline: `vite.config.js`
**Status:** Partially configured. Missing Vitest test config.

Add to `vite.config.js`:
```js
test: {
  environment: 'node',
  include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
  exclude: ['tests/behavior/**'],
}
```

Also: the `@crxjs/vite-plugin` is `^2.0.0-beta.28` (beta). Verify it handles Shadow DOM CSS injection correctly in the build.

---

### Task 1.5 — Extension popup: token entry
**File:** `src/popup/popup.js` — already has skeleton. Needs:
- Input field for GitHub PAT
- Save to `chrome.storage.local` as `github_token`
- Visual confirmation (green checkmark on save)
- "Forget token" button (clears storage)
- Quick re-auth console snippet shown in footer

**Acceptance:** User pastes token in popup → navigates to any GitHub PR → DiffCast tab appears.

---

### Task 1.6 — PR list risk badge injection
**File:** `src/content.js` — currently only injects the DiffCast tab on PR detail pages.

Add: detect `github.com/*/pulls` (list view), inject risk pill next to each PR title. Data source: call `LOAD_PR` for each visible PR hash (batched, max 10 per page view), use `commitRiskScores` max to generate the pill color.

**Acceptance:** GitHub PR list shows colored risk pills. Toggle button shows/hides them (matches `experiments/01-diff-animation/pr-list.html`).

---

### Task 1.7 — Behavior tests (Playwright)
**Directory:** `tests/behavior/`
**Status:** Not started. Requires loadable `dist/` first.

Tests to write after Task 1.2 is complete:
- `tests/behavior/slider.test.js` — drag slider 0→50%, confirm commit 2 card visible
- `tests/behavior/fileSelect.test.js` — click file in list, confirm diff table re-renders
- `tests/behavior/viewToggle.test.js` — toggle Reviewer↔Author, confirm CSS class change
- `tests/behavior/keyboard.test.js` — ArrowRight, confirm pip advances

Each test loads the extension in Playwright's Chrome context (`--load-extension=dist/`).

---

### Phase 1 completion criteria
- [ ] `npm run build` produces a `dist/` folder with no errors
- [ ] Extension loads in Chrome (`chrome://extensions` → Load unpacked → `dist/`)
- [ ] DiffCast tab appears on any `github.com/*/pull/*` URL
- [ ] Slider animates through mock 4-commit scenario
- [ ] Risk colors visible on diff lines
- [ ] No console errors in extension context
- [ ] `npm run test:unit` + `npm run test:integration` pass (24+ tests)
- [ ] `npm run guard` clean (no anti-patterns)

---

## Phase 2 — Real GitHub API (Weeks 6–8)
**Goal:** Real PR data flows through the extension. James loads a real PR and sees its actual commits animated.
**Not:** Payment, team features, PR list badges (Phase 2.5).

### Task 2.1 — Wire `LOAD_PR` to real GitHub API
Background.js `loadPR()` is already fully written. Remove the mock fallback. The implementation is complete except for one gap: `COMMIT_BOUNDARIES` in `animationEngine.js` is hardcoded for 4 commits. Make it dynamic based on `commits.length`.

### Task 2.2 — Author churn signal
`getAuthorChurn()` is implemented. Wire it into the `loadPR` pipeline (already wired in background.js). The gap: commits > 20 are truncated without a UI indicator. Add a "Showing X of Y commits" badge when `truncated === true`.

### Task 2.3 — Free tier gate UI
When `tier === 'free'` and `truncated === true`, show an upgrade prompt in the timeline area: "Showing 5 of N commits — Pro unlocks all N." Link to `https://diffcast.app/upgrade`.

---

## Phase 3 — Monetization (Weeks 9–12)
- Cloudflare Worker license validation endpoint
- Stripe checkout integration
- License key storage in `chrome.storage.local`
- Pro/Team feature gates throughout the UI

---

## Phase 4 — PR list badges + CodeScene integration (Months 4–5)
- `content.js` PR list injection (Task 1.6 becomes a real feature)
- CodeScene API integration for empirical file hotspot weights
- GIF/MP4 export of the animation

---

## Phase 5 — AI narrative layer (Month 6+)
- Claude Haiku integration for commit-level narrative generation
- Auto-fill Author view commit card "intent" fields
- Dangerous window natural-language explanation

---

## Feature backlog (unscheduled, validated by market analysis)

These features are supported by competitive analysis but not yet assigned to a phase:

| Feature | Signal | Est. effort |
|---|---|---|
| **Side-by-side "before/after" line comparison** (like Gerrit's diff against base) | Gerrit users miss this in GitHub | Medium |
| **Temporal coupling detector** — which files always change together in this author's PRs | CodeScene validates the concept at repo level | High |
| **"Review debt" badge** — PRs awaiting review ranked by risk score | PR list badge is the entry; ranking is the upgrade | Low |
| **Commit atomicity score** — did auth and its tests land in the same commit? | Dangerous window concept extended | Medium |
| **Author PR pattern card** — "Neil usually commits in 4-6 commits, this PR has 12 — unusual" | Behavioral analysis, CodeScene-adjacent | High |
| **GitLab + Bitbucket support** | Reviewable and CodeRabbit both support GitLab — market expects it | High |
| **VS Code extension** — local diff animation without GitHub (for pre-push review) | `difit` and `diffty` validate the local review pattern | Medium |
| **"Watch mode"** — extension polls for new commits on a PR and animates only the delta since last review | LinearB's "new since your last review" concept | Medium |
| **Embeddable widget** — `<diffcast-replay pr="214" repo="org/repo">` web component | Docs and wiki embedding use case | High |
| **Compliance audit trail** — exported JSON of review coverage per PR, signable | Enterprise fintech/healthcare requirement | High |

---

## Distribution playbook

### Pre-launch (Phase 0.5 → Phase 2)
1. **Build the waitlist page** at `diffcast.app` now. Static page, Tally.so embed. The email list is the Phase 3 launch audience.
2. **Record the demo GIF.** 15-second screen capture animating through a real open-source PR (React, Next.js, Tailwind — something recognizable). The GIF IS the marketing asset. Every channel uses it.
3. **Write the Show HN draft** now, before launch. Iterate it as the product matures.

### Launch day (Phase 3)
- **09:00** — Product Hunt launch (schedule for upvote velocity in first hour)
- **09:30** — Hacker News Show HN
- **10:00** — Twitter/X thread: *"What if PR review felt like scrubbing a video?"* + GIF
- **Same day** — r/programming, r/webdev, r/github

### Ongoing
- Dev.to / Hashnode article: *"I built a Chrome extension that animates GitHub pull requests"* (SEO: "GitHub code review extension," "pull request diff viewer")
- Direct outreach to GitKraken partnerships
- Identify 5 engineering teams with documented "hard to review" PR culture — offer free Pro tier for 30 days in exchange for a public testimonial
- Submit to `awesome-code-review` and `awesome-chrome-extensions-for-developers` lists

---

## Anti-patterns to avoid

| Temptation | Why to resist |
|---|---|
| Add inline comment threading | Competes with GitHub's own review system and Reviewable — don't |
| Index or store PR content on DiffCast servers | Privacy landmine; all analysis stays client-side (extension + GitHub API) |
| Support PRs with 500+ commits | Performance cliff; gate at 100 commits in Pro, 250 in Team |
| Build a web app alongside the extension | Splits focus; the extension IS the product until $50K ARR |
| Compete with CodeRabbit on AI comments | Wrong axis; DiffCast is the visual layer CodeRabbit can sit on top of |
| Add features before fixing the prototype UX | Phase 0.5 fixes are load-bearing; build on a validated foundation |

---

## Key metrics (from day 1)

- **Installs** (Chrome Web Store analytics)
- **D7 retention** — do people use it a week after installing?
- **Play button engagement rate** — do users hit play on the first PR they open?
- **Slider engagement past commit 1** — are they watching the whole PR or just glancing?
- **Time to first upgrade** — how many PRs before a free user converts?
- **PR list badge impressions** — how often does the ambient feature create organic discovery?

**The single most important signal:** Do users open a PR and immediately hit play? If yes, the core loop works. If they open it, scan the diff table, and close it — the animation is not compelling enough and the motion design needs iteration before anything else.

---

## Reference documents

| Document | Location |
|---|---|
| Market analysis | `docs/MARKET-ANALYSIS.md` |
| Architecture decisions | `docs/adr/ADR-001` through `ADR-004` |
| Mandatory coding patterns | `agent-os/standards/global/mandatory-patterns.md` |
| Anti-pattern registry | `agent-os/analysis/RECURRING-PATTERNS.md` |
| Test writing rules | `agent-os/standards/testing/test-writing.md` |
| Loop agent workflow | `agent-os/standards/global/loop-operations.md` |
| Domain glossary | `docs/CONTEXT.md` |
| Skill catalog | `agent-os/product/skills.md` |
