import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — TPS booklet end-to-end test.
 *
 * Default target: production (https://messenginfo.com). Override with
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 to run against local dev.
 *
 * OCR processing is ~15-20s, so action/navigation timeouts are generous.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Single canonical run; no need for parallelism on a one-image test.
  fullyParallel: false,
  workers: 1,
  // OCR latency can spike; never retry against prod (would double-charge OCR).
  retries: 0,
  reporter: [['list']],
  timeout: 120_000, // 2 min per test — OCR + review render

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://messenginfo.com',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
