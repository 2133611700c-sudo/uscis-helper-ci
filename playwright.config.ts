import { defineConfig } from '@playwright/test'

// E2E UI smoke against the LIVE deployment (default prod; override via E2E_BASE_URL).
// Born from the 2026-06-11 lesson: 5+ sessions were lost because only the API layer
// was tested — wizard CONFIG bugs (autoread flag, label whitelist) were invisible.
export default defineConfig({
  testDir: './tests/e2e-ui',
  timeout: 240_000, // real Gemini extraction on a doc takes 40-120s
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://messenginfo.com',
    headless: true,
  },
  reporter: [['list']],
})
