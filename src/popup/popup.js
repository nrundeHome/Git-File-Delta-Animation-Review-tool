// DiffCast popup — PAT management and tier display
// Per RULE-05 (auth error paths): always assert URL unchanged, error visible, no raw JSON

async function init() {
  const { token } = await chrome.runtime.sendMessage({ type: 'GET_TOKEN' })
  if (token) {
    await showConnected(token)
  } else {
    showDisconnected()
  }
}

async function connect() {
  const input = document.getElementById('tokenInput')
  const token = input.value.trim()
  const errEl = document.getElementById('tokenError')

  errEl.classList.remove('show')

  // Basic format validation — PATs start with ghp_ or github_pat_
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    errEl.textContent = 'Token must start with ghp_ or github_pat_'
    errEl.classList.add('show')
    return
  }

  // Test the token with a lightweight API call before saving
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization':        `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!res.ok) {
      // RULE-05: inline error, no raw JSON shown
      errEl.textContent = res.status === 401
        ? 'Token is invalid or expired'
        : `GitHub returned ${res.status} — check token scopes`
      errEl.classList.add('show')
      return
    }

    const user = await res.json()
    if (typeof user !== 'object' || !user.login) {
      // RULE-05: raw JSON guard
      errEl.textContent = 'Unexpected response from GitHub — please try again'
      errEl.classList.add('show')
      return
    }

    await chrome.runtime.sendMessage({ type: 'SET_TOKEN', token })
    await showConnected(token, user.login)
    input.value = ''

  } catch (err) {
    errEl.textContent = 'Network error — check your connection'
    errEl.classList.add('show')
  }
}

async function showConnected(token, login) {
  // Fetch user info if login not passed
  if (!login) {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      })
      if (res.ok) {
        const user = await res.json()
        login = user.login
      }
    } catch (_) {}
  }

  document.getElementById('statusDot').className  = 'status-dot connected'
  document.getElementById('statusText').innerHTML =
    login ? `Connected as <span class="status-user">@${login}</span>` : 'Connected'

  document.getElementById('tokenSection').style.display = 'none'
  document.getElementById('tierSection').style.display  = 'block'

  // Show tier
  const tierData = await chrome.runtime.sendMessage({ type: 'GET_TIER' })
  const badge    = document.getElementById('tierBadge')
  const cta      = document.getElementById('upgradeCta')

  if (tierData.tier === 'pro' || tierData.tier === 'team') {
    badge.textContent = tierData.tier.toUpperCase()
    badge.className   = 'tier-badge pro'
    cta.style.display = 'none'
  }
}

function showDisconnected() {
  document.getElementById('statusDot').className  = 'status-dot disconnected'
  document.getElementById('statusText').textContent = 'Not connected'
  document.getElementById('tokenSection').style.display = 'block'
  document.getElementById('tierSection').style.display  = 'none'
}

async function disconnect() {
  await chrome.storage.local.remove(['github_token', 'license'])
  showDisconnected()
}

function openUpgrade() {
  chrome.tabs.create({ url: 'https://diffcast.app/upgrade' })
}

function openDocs() {
  chrome.tabs.create({ url: 'https://diffcast.app/docs' })
}

function openFeedback() {
  chrome.tabs.create({ url: 'https://github.com/diffcast/diffcast/issues' })
}

// Wire all interactive elements — inline onclick won't fire in module context
document.getElementById('connectBtn')?.addEventListener('click', connect)
document.getElementById('disconnectBtn')?.addEventListener('click', disconnect)
document.getElementById('upgradeBtn')?.addEventListener('click', openUpgrade)
document.getElementById('docsLink')?.addEventListener('click', openDocs)
document.getElementById('feedbackLink')?.addEventListener('click', openFeedback)
document.getElementById('tokenInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') connect()
})

init()
