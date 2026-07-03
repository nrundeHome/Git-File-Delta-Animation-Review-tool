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

  // Validate via background service worker — uses githubApi wrapper (no bare fetch here)
  // RULE-05: error messages are user-friendly, no raw JSON ever shown
  const result = await chrome.runtime.sendMessage({ type: 'VALIDATE_TOKEN', token })

  if (!result.ok) {
    errEl.textContent = result.error ?? 'Could not validate token'
    errEl.classList.add('show')
    return
  }

  await chrome.runtime.sendMessage({ type: 'SET_TOKEN', token })
  await showConnected(token, result.login)
  input.value = ''
}

async function showConnected(token, login) {
  // Fetch user info if login not passed — route through background service worker
  if (!login) {
    const result = await chrome.runtime.sendMessage({ type: 'VALIDATE_TOKEN', token }).catch(() => null)
    if (result?.ok) login = result.login
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
