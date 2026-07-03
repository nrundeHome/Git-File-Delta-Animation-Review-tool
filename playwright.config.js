import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:  './tests/behavior',
  timeout:  30_000,
  retries:  process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL:     'http://localhost:5173',
    // Trace on first retry in CI — helps debug flaky tests
    trace:       'on-first-retry',
    // Shadow DOM access requires open mode (set in test harness)
    bypassCSP:   true,
  },

  projects: [
    {
      name:   'chromium',
      use:    { ...devices['Desktop Chrome'] },
    },
  ],

  // Start Vite dev server before running behavior tests.
  // In CI, set VITE_SERVER_RUNNING=1 to skip (server is pre-started).
  webServer: process.env.VITE_SERVER_RUNNING ? undefined : {
    command:             'npm run dev',
    url:                 'http://localhost:5173',
    reuseExistingServer: true,
    timeout:             15_000,
  },
})
