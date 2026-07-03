# ADR-004: PAT Auth for v1, OAuth in v2

**Status:** Accepted  
**Date:** 2026-07-03

## Context
The extension needs to call the GitHub API with authentication (5,000 req/hr vs 60 unauth). OAuth requires a server to handle the callback and exchange the code for a token.

## Decision
**v1:** User pastes a GitHub Personal Access Token (classic, `repo` scope) into the extension popup. Stored in `chrome.storage.local`.

**v2 (Phase 3):** GitHub OAuth App flow via a Cloudflare Worker. Worker handles callback, exchanges code for token, redirects to `chrome-extension://{id}/oauth-callback.html`.

## v1 security properties
- `chrome.storage.local` is encrypted by Chrome using the OS keychain (AES-256 on macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Token is never sent to any DiffCast server — only to `api.github.com` directly from the Service Worker
- Token scope: `repo` (read-only for private repos). We never request write scopes.

## v1 UX
```
Extension popup → "Enter GitHub token" input → Save
Popup shows: ✓ Connected as neil.runde (repo scope)
```

## v2 OAuth flow (Cloudflare Worker)
```
User clicks "Connect GitHub" in popup
  → chrome.identity.launchWebAuthFlow(githubOAuthUrl)
  → GitHub redirects to Worker: /oauth/callback?code=XXX
  → Worker exchanges code for token (server-to-server, keeps client_secret safe)
  → Worker redirects to chrome-extension://.../oauth-success.html?token=XXX
  → Extension extracts token, stores in chrome.storage.local
```

## Consequences (v1)
- Zero server infrastructure required
- User must know how to generate a PAT (acceptable for developer audience)
- PAT expiry requires manual re-paste (mitigated by showing expiry date in popup)
- No refresh token — when PAT expires, user re-pastes

## Rejected alternatives
- **OAuth in v1:** Requires Cloudflare Worker + domain + DNS before launch. Adds 2-week critical path.
- **GitHub App installation:** Requires org admin approval, not viable for individual installs
