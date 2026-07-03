# Loop Operations Standard

## State File Format

Location: `memory/loop-state-{loop-name}-{YYYY-MM-DD}.md`
Retention: keep 7 most recent per loop name; archive older to `memory/_archive/`

```
---
loop: {name}
date: YYYY-MM-DD
status: complete | partial | blocked | escalated
---

## Discovered
- [ ] {unresolved item}
- [x] {resolved item}

## Verified
- [x] {item}: test scope PASS, guard PASS — {ISO timestamp}

## Reviewed
- [ ] {commit hash}: pending review
- [x] {commit hash}: reviewed by {name} on YYYY-MM-DD

## Pending Human Review
- {item requiring decision — not automatable}

## Next Cycle
- {item to carry forward with reason}
```
