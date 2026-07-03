# ADR-001: Chrome Manifest V3

**Status:** Accepted  
**Date:** 2026-07-03

## Context
Chrome deprecated Manifest V2 in 2023. All new extensions must use V3. Key change: persistent background pages replaced by ephemeral Service Workers.

## Decision
Use Manifest V3 with a Service Worker for all GitHub API calls.

## Consequences
- All API calls go through `background.js` (Service Worker) via `chrome.runtime.sendMessage`
- Content scripts request data, never call APIs directly
- Service Worker can be killed between calls — state must live in `chrome.storage`, not in-memory
- Sidesteps GitHub's CSP restrictions on content scripts (API calls don't originate from the injected context)

## Rejected alternatives
- **MV2 with background page:** Blocked by Chrome Web Store since Jan 2025
- **Offscreen document for API calls:** Unnecessarily complex; Service Worker handles this cleanly
