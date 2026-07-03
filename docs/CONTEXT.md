# Domain Context

## Canonical Terms

| Term | Definition | Code location |
|---|---|---|
| Diff Frame | Snapshot of a file at one commit in the PR | `src/services/diffParser.js` |
| Timeline | Ordered sequence of commits; slider maps to this | `src/components/TimeSlider.js` |
| Risk Score | 0–100 calculated per frame (size, churn, file type, author history) | `src/utils/riskCalculator.js` |
| Risk Threshold | Breakpoints: 0-33 low (green), 34-66 medium (yellow), 67-100 high (red) | `src/config/risk.js` |
| Chunk | Contiguous block of added/removed/unchanged lines within a Diff Frame | `src/services/diffParser.js` |
| Animation Tick | One `requestAnimationFrame` callback — renders one Diff Frame | `src/utils/animationEngine.js` |
