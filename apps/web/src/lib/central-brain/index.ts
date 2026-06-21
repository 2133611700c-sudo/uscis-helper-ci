/**
 * Central Brain — only the health status export remains.
 *
 * The engine-consensus pipeline (`analyze()` + `lib/engine/*`) was built but
 * never wired into any production route — it had zero callers across the app,
 * scripts, and workflows. It has been removed (Phase 2 quarantine). The single
 * live consumer of this module is `/api/central-brain/health`, which calls
 * `brainHealth()`.
 *
 * Do NOT reintroduce an engine pipeline here. The live document pipeline is
 * `lib/docintel` + `lib/canonical/core` (arbitration), reached from the four
 * extract routes.
 */
export { brainHealth } from './health'
