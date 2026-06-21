#!/usr/bin/env node
/**
 * verify-release-state.mjs — guard for the VERIFIED SNAPSHOT source of truth.
 *
 * Dependency-free (Node built-ins only). Honest model: RELEASE_STATE.yaml is a
 * verified snapshot of main at `snapshot.state_basis_main_sha`, not a live mirror.
 *
 * HARD FAIL (exit 1) on:
 *   1. RELEASE_STATE.yaml missing or missing required shape (schema_version: 2).
 *   2. STATUS.md has != 1 "# STATUS" H1 (no stacked history).
 *   3. STATUS.md still asserts the stale "PR #120 DRAFT".
 *   4. state_basis_main_sha is NOT a real commit object (fabrication).
 *   5. verified_production_sha is neither 40-hex nor UNVERIFIED.
 *   6. Fabricated Vercel/Stripe runtime state (must be UNVERIFIED).
 *
 * REPORT + WARN (exit 0) on:
 *   - current_head_sha / snapshot_basis_sha / snapshot_is_stale.
 *   - snapshot stale (basis != resolvable main tip). Staleness is EXPECTED right
 *     after the snapshot's own PR merges; it must never block merge or loop.
 *
 * PII-safe: prints only SHAs/booleans/keys, never field values.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (msg) => { console.error(`[release-state] FAIL: ${msg}`); process.exit(1) }
const ok = (msg) => console.log(`[release-state] OK: ${msg}`)
const warn = (msg) => console.warn(`[release-state] WARN: ${msg}`)

const RS = resolve(ROOT, 'RELEASE_STATE.yaml')
const STATUS = resolve(ROOT, 'STATUS.md')
if (!existsSync(RS)) fail('RELEASE_STATE.yaml missing')
if (!existsSync(STATUS)) fail('STATUS.md missing')

const rs = readFileSync(RS, 'utf8')
const status = readFileSync(STATUS, 'utf8')

const git = (...args) => execFileSync('git', args, { cwd: ROOT }).toString().trim()
const gitSafe = (...args) => { try { return git(...args) } catch { return null } }

// (1) required snapshot shape
const REQUIRED = [
  'schema_version:', 'snapshot:', 'state_basis_main_sha:', 'verified_production_sha:',
  'verified_at:', 'prs:', 'products:', 'tps:', 'reparole:', 'ead:', 'translation:',
  'browser_pii:', 'test_infrastructure:', 'document_intelligence:', 'blockers:', 'deferred:',
]
const missing = REQUIRED.filter((k) => !rs.includes(k))
if (missing.length) fail(`RELEASE_STATE.yaml missing required keys: ${missing.join(', ')}`)
if (!/^schema_version:\s*2\b/m.test(rs)) fail('RELEASE_STATE.yaml must be schema_version: 2 (verified-snapshot model)')
ok('RELEASE_STATE.yaml has required snapshot shape (schema_version 2)')

// (2) exactly one current STATUS H1
const h1 = (status.match(/^# STATUS\b/gm) || []).length
if (h1 !== 1) fail(`STATUS.md must have exactly ONE "# STATUS" H1, found ${h1} (history → docs/STATUS_ARCHIVE.md)`)
ok('STATUS.md has exactly one current heading')

// (3) no stale "PR #120 DRAFT"
if (/#\s*120\s*draft/i.test(status) || /pr\s*#?120\b[^\n]*draft/i.test(status)) {
  fail('STATUS.md still asserts "PR #120 DRAFT" — #120 is merged/deployed')
}
ok('STATUS.md does not assert the stale #120 DRAFT state')

// read a simple "key: value" (tolerates inline "# comments" + quotes)
const yval = (key) => {
  const m = rs.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))
  if (!m) return undefined
  return m[1].trim().replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim()
}
const basisSha = yval('state_basis_main_sha')
const prodSha = yval('verified_production_sha')

// (4) basis must be a REAL commit object — but NOT required to equal current HEAD
if (!/^[0-9a-f]{40}$/.test(basisSha || '')) fail('snapshot.state_basis_main_sha must be a 40-hex SHA')
if (gitSafe('cat-file', '-t', basisSha) !== 'commit') {
  fail('snapshot.state_basis_main_sha is not a real commit in this repository (possible fabrication)')
}
ok('state_basis_main_sha is a real commit object')

// (5) verified_production_sha format (UNVERIFIED allowed)
if (prodSha !== 'UNVERIFIED' && !/^[0-9a-f]{40}$/.test(prodSha || '')) {
  fail('snapshot.verified_production_sha must be a 40-hex SHA or UNVERIFIED')
}
ok('verified_production_sha is well-formed')

// (6) UNVERIFIED discipline for runtime state
for (const key of ['production_mode', 'stripe_test_environment', 'hosted_stripe_e2e', 'stripe_environment']) {
  for (const line of rs.match(new RegExp(`${key}:\\s*"?([^"\\n]+)"?`, 'g')) || []) {
    const v = line.split(':')[1].replace(/["']/g, '').replace(/\s+#.*$/, '').trim()
    if (/^(enforce|live|test|true|passed|green)$/i.test(v)) {
      fail(`${key} claims "${v}" — not verifiable from repository; must be UNVERIFIED`)
    }
  }
}
ok('no Vercel/Stripe runtime state is fabricated (UNVERIFIED discipline held)')

// REPORT: current head vs snapshot basis vs main tip (no self-reference assumption)
const headSha = gitSafe('rev-parse', 'HEAD')
const mainTip = gitSafe('rev-parse', 'origin/main') || gitSafe('rev-parse', 'main')
console.log(`[release-state] current_head_sha = ${headSha ?? 'unknown'}`)
console.log(`[release-state] snapshot_basis_sha = ${basisSha}`)
console.log(`[release-state] main_tip_sha = ${mainTip ?? 'unknown'}`)
const onMainPush =
  process.env.GITHUB_REF === 'refs/heads/main' ||
  (process.env.GITHUB_EVENT_NAME === 'push' && (process.env.GITHUB_REF_NAME === 'main'))

if (mainTip) {
  const stale = mainTip !== basisSha
  console.log(`[release-state] snapshot_is_stale = ${stale}`)
  if (stale) {
    // Staleness is informational, never a hard failure (avoids the snapshot's own
    // post-merge SHA paradox + any push→fix→push loop).
    warn(`snapshot basis (${basisSha.slice(0, 7)}) != main tip (${mainTip.slice(0, 7)}); refresh RELEASE_STATE.yaml in the next release-truth PR`)
  } else {
    ok('snapshot basis matches current main tip')
  }
  // Advisory: a PR that changes STATUS.md should also refresh RELEASE_STATE.yaml.
  if (!onMainPush && mainTip) {
    const changed = gitSafe('diff', '--name-only', `${mainTip}...HEAD`)
    if (changed && /(^|\n)STATUS\.md(\n|$)/.test(changed) && !/(^|\n)RELEASE_STATE\.yaml(\n|$)/.test(changed)) {
      warn('this PR changes STATUS.md but not RELEASE_STATE.yaml — confirm the snapshot is still accurate')
    }
  }
} else {
  warn('could not resolve main tip (no origin/main ref) — staleness not computed')
}

console.log('[release-state] PASS')
