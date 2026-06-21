#!/usr/bin/env node
/**
 * verify-v1-completion.mjs — guard for the V1_COMPLETION control plane.
 *
 * Dependency-free. Enforces the sequential-pipeline rules so the project cannot
 * go in circles or skip gates. HARD FAIL (exit 1) on any violation.
 *
 * Checks:
 *  1. exactly one active phase (status IN_PROGRESS|BLOCKED|FAILED) == active_phase
 *  2. phases before active = PASS; phases after active = NOT_STARTED
 *  3. any PASS phase has its evidence file on disk
 *  4. production forbidden as benchmark target (policies)
 *  5. handwriting NOT in V1 auto-final
 *  6. PR #119 frozen; global enforce forbidden; new products forbidden
 *  7. positive Stripe delivery == RUNTIME_UNVERIFIED
 *  8. the 5 V1 workflows exist and have `on:` + `jobs:` (syntax sanity)
 *  9. V1_STATUS.md is marked generated (not hand-authored)
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (m) => { console.error(`[v1-guard] FAIL: ${m}`); process.exit(1) }
const ok = (m) => console.log(`[v1-guard] OK: ${m}`)

const F = resolve(ROOT, 'V1_COMPLETION.yaml')
if (!existsSync(F)) fail('V1_COMPLETION.yaml missing')
const y = readFileSync(F, 'utf8')

// scalar reader (tolerates inline comments + quotes)
const val = (key) => {
  const m = y.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))
  if (!m) return undefined
  return m[1].trim().replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim()
}

// (4-7) policies
const policy = (k, want) => { if (val(k) !== want) fail(`policy ${k} must be ${want} (got ${val(k) ?? 'undefined'})`) }
policy('pr_119', 'frozen')
policy('global_enforce', 'forbidden')
policy('new_products', 'forbidden')
policy('production_as_benchmark_target', 'forbidden')
policy('benchmark_target', 'staging_only')
policy('handwriting_in_v1_auto_final', 'false')
policy('positive_stripe_delivery', 'RUNTIME_UNVERIFIED')
policy('canonical_core_rewrite', 'forbidden')
ok('policies hold (no prod-benchmark, no enforce, no new products, #119 frozen, handwriting not auto-final)')

// parse phases in order: each "- name: X" followed by its "status: Y" + "evidence: Z"
const phaseBlocks = y.split(/\n\s*- name:\s*/).slice(1)
if (phaseBlocks.length !== 13) fail(`expected 13 phases, found ${phaseBlocks.length}`)
const phases = phaseBlocks.map((b) => {
  const name = b.split(/\r?\n/)[0].trim().replace(/^["']|["']$/g, '')
  const status = (b.match(/^\s*status:\s*(.+)$/m) || [])[1]?.trim()
  const evidence = (b.match(/^\s*evidence:\s*(.+)$/m) || [])[1]?.trim()
  return { name, status, evidence }
})

const ENUM = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'PASS', 'FAILED']
for (const p of phases) {
  if (!ENUM.includes(p.status)) fail(`phase ${p.name} has invalid status ${p.status}`)
}

const active = val('active_phase')
const activeIdx = phases.findIndex((p) => p.name === active)
if (activeIdx < 0) fail(`active_phase ${active} is not in the phases list`)

// (1) exactly one active phase, and it equals active_phase
const activeStatuses = phases.filter((p) => ['IN_PROGRESS', 'BLOCKED', 'FAILED'].includes(p.status))
if (activeStatuses.length !== 1) fail(`exactly one active phase required, found ${activeStatuses.length}`)
if (activeStatuses[0].name !== active) fail(`active_phase (${active}) != the active-status phase (${activeStatuses[0].name})`)
ok(`exactly one active phase: ${active} (${phases[activeIdx].status})`)

// (2) ordering: before = PASS, after = NOT_STARTED
phases.forEach((p, i) => {
  if (i < activeIdx && p.status !== 'PASS') fail(`phase ${p.name} precedes the active phase but is ${p.status} (must be PASS)`)
  if (i > activeIdx && p.status !== 'NOT_STARTED') fail(`phase ${p.name} follows the active phase but is ${p.status} (must be NOT_STARTED)`)
})
ok('phase ordering holds (before=PASS, after=NOT_STARTED)')

// (3) PASS requires evidence file
for (const p of phases) {
  if (p.status === 'PASS') {
    if (!p.evidence || !existsSync(resolve(ROOT, p.evidence))) {
      fail(`phase ${p.name} is PASS but evidence file is missing: ${p.evidence}`)
    }
  }
}
ok('every PASS phase has an evidence artifact')

// (8) workflows exist + basic syntax
const wf = [
  'v1-fast-gates.yml',
  'v1-nightly-staging.yml',
  'v1-document-benchmark.yml',
  'v1-production-readonly-smoke.yml',
  'v1-program-guard.yml',
]
for (const w of wf) {
  const p = resolve(ROOT, '.github/workflows', w)
  if (!existsSync(p)) fail(`workflow missing: ${w}`)
  const c = readFileSync(p, 'utf8')
  if (!/^on:/m.test(c) || !/^jobs:/m.test(c)) fail(`workflow ${w} missing on:/jobs:`)
}
ok('all 5 V1 workflows present with on:/jobs:')

// (9) dashboard is generated
const statusPath = resolve(ROOT, 'V1_STATUS.md')
if (existsSync(statusPath)) {
  if (!/GENERATED/.test(readFileSync(statusPath, 'utf8'))) fail('V1_STATUS.md must be marked GENERATED (do not hand-edit)')
  ok('V1_STATUS.md marked generated')
}

console.log('[v1-guard] PASS')
