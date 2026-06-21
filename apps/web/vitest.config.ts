import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Default 5 000 ms is too short for tests that touch the filesystem or
    // import heavy modules. 30 s covers most integration tests; the three
    // PDF-heavy suites (tps/packetBuilder, reparole/packetBuilder,
    // controlledBetaLock) set 120 s per-file via vi.setConfig().
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
