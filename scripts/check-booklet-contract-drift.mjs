#!/usr/bin/env node
/**
 * scripts/check-booklet-contract-drift.mjs
 *
 * Catches the bug pattern that bit Session 17: the server-side
 * documentContracts.booklet.allowed_fields was correctly extended to
 * include `family_name`, but the wizard client still had three
 * independent filters on the wave1 = 3-field set. The field flowed
 * through the API correctly, then the client silently dropped it.
 *
 * This script reads the constants out of source at CI time and fails
 * loud if they drift. It is a stopgap. The proper fix is to refactor
 * the client filters to import from documentContracts.ts directly,
 * after which this script collapses to a typecheck. Until then, this
 * is the gate.
 *
 * Exits non-zero on drift. Exits 0 when all three sets match.
 *
 * Usage:
 *   node scripts/check-booklet-contract-drift.mjs
 *   pnpm --filter web check:contract-drift   (after wire-up)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO = path.resolve(__dirname, '..')

const CONTRACT_FILE = path.join(REPO, 'apps/web/src/lib/tps/ocr/documentContracts.ts')
const WIZARD_FILE = path.join(REPO, 'apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx')
const ROUTE_FILE = path.join(REPO, 'apps/web/src/app/api/tps/ocr/extract/route.ts')
const TYPES_FILE = path.join(REPO, 'apps/web/src/lib/tps/types.ts')
const ARBITER_FILE = path.join(REPO, 'apps/web/src/lib/tps/fieldArbiter.ts')

/**
 * Parse documentContracts.booklet.allowed_fields out of the TS source.
 * Looks for the `booklet:` slot block, then for its `allowed_fields: [ ... ]`
 * array, then extracts quoted strings. This is brittle on purpose — if
 * someone refactors the contract shape, the script breaks loudly and a
 * human re-reads it. That is preferable to a soft-fail that gives a
 * false green.
 */
function readServerContractBookletAllowed() {
  const src = fs.readFileSync(CONTRACT_FILE, 'utf8')
  // Find `booklet: { ... },` slot block.
  const slotMatch = src.match(/booklet:\s*\{([\s\S]*?)\},\s*i94:/)
  if (!slotMatch) {
    throw new Error(`Could not locate booklet slot in ${CONTRACT_FILE}. Did the shape change?`)
  }
  const slotBody = slotMatch[1]
  // Find allowed_fields: [ ... ],
  const allowedMatch = slotBody.match(/allowed_fields:\s*\[([\s\S]*?)\]\s*,/)
  if (!allowedMatch) {
    throw new Error(`Could not locate booklet.allowed_fields in ${CONTRACT_FILE}.`)
  }
  return extractQuotedIdentifiers(allowedMatch[1])
}

/**
 * Parse BOOKLET_WAVE1_FIELDS literal out of TPSWizardV2.tsx.
 * Expects: `const BOOKLET_WAVE1_FIELDS: ReadonlySet<string> = new Set([...])`.
 */
function readClientWave1Fields() {
  const src = fs.readFileSync(WIZARD_FILE, 'utf8')
  const m = src.match(/const\s+BOOKLET_WAVE1_FIELDS[^=]*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/)
  if (m) {
    return extractQuotedIdentifiers(m[1])
  }
  // New contract-as-API path: BOOKLET_WAVE1_FIELDS aliases SLOT_ALLOWED_FIELDS.booklet.
  // In this mode the client does not carry a second literal whitelist.
  if (/const\s+BOOKLET_WAVE1_FIELDS[^=]*=\s*SLOT_ALLOWED_FIELDS\.booklet/.test(src)) {
    return readClientSlotAllowedBooklet()
  }
  throw new Error(`Could not locate BOOKLET_WAVE1_FIELDS in ${WIZARD_FILE}.`)
}

/**
 * Parse SLOT_ALLOWED_FIELDS.booklet literal out of TPSWizardV2.tsx.
 * Expects an entry like `booklet: new Set([...]),` inside SLOT_ALLOWED_FIELDS.
 */
function readClientSlotAllowedBooklet() {
  const src = fs.readFileSync(WIZARD_FILE, 'utf8')
  // New contract-as-API path: SLOT_ALLOWED_FIELDS is derived from DOCUMENT_CONTRACTS.
  // If this pattern is present, booklet whitelist equals server contract by construction.
  if (
    /const\s+SLOT_ALLOWED_FIELDS[^=]*=\s*Object\.fromEntries\(/.test(src) &&
    src.includes('DOCUMENT_CONTRACTS')
  ) {
    return readServerContractBookletAllowed()
  }
  // Anchor on SLOT_ALLOWED_FIELDS declaration to avoid matching unrelated
  // `booklet: new Set(...)` literals elsewhere in the file.
  const declMatch = src.match(/SLOT_ALLOWED_FIELDS[\s\S]*?=\s*\{([\s\S]*?)\n\}\s*\n/)
  if (!declMatch) {
    throw new Error(`Could not locate SLOT_ALLOWED_FIELDS in ${WIZARD_FILE}.`)
  }
  const declBody = declMatch[1]
  const bookletMatch = declBody.match(/booklet:\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/)
  if (!bookletMatch) {
    throw new Error(`Could not locate SLOT_ALLOWED_FIELDS.booklet in ${WIZARD_FILE}.`)
  }
  return extractQuotedIdentifiers(bookletMatch[1])
}

/**
 * Pull quoted strings out of an array literal body, ignoring comments
 * and whitespace. Returns a Set of identifiers.
 */
function extractQuotedIdentifiers(body) {
  // Strip both line and block comments before extracting strings, so
  // commented-out entries do NOT leak into the result.
  const noBlockComments = body.replace(/\/\*[\s\S]*?\*\//g, '')
  const noComments = noBlockComments.replace(/\/\/[^\n]*/g, '')
  const matches = noComments.match(/['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g) || []
  return new Set(matches.map((s) => s.slice(1, -1)))
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE-TYPE UNION DRIFT (the "third leg" of the Session 17 bug)
//
// Session 17 bug had THREE legs:
//  (1) BOOKLET_WAVE1_FIELDS missing family_name
//  (2) SLOT_ALLOWED_FIELDS.booklet missing the booklet entry
//  (3) ExtractionSource / SourceType unions missing 'dual_ocr_crossref'
//
// Leg (3) was the silent killer: even when the server emitted a field with
// source 'dual_ocr_crossref', the client union narrowing collapsed it to
// 'ocr_visual' (the fallback), demoting its priority in the field arbiter.
//
// The original drift gate covers legs (1) and (2). This section covers
// leg (3): every source value the server emits MUST be a member of all
// three client unions, otherwise it silently degrades.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse all `extraction_source: '...'` string literals from route.ts.
 * Returns the set of source values the server actually emits.
 */
function readServerEmittedSources() {
  const src = fs.readFileSync(ROUTE_FILE, 'utf8')
  const matches = src.match(/extraction_source:\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g) || []
  return new Set(matches.map((m) => m.match(/['"]([^'"]+)['"]/)[1]))
}

/**
 * Parse a TypeScript union type declaration by name out of source.
 * Handles the pattern:
 *   export type <Name> = 'a' | 'b' | 'c'
 *   export type <Name> =
 *     | 'a'
 *     | 'b'
 * Returns the set of string-literal members.
 */
function readUnionMembers(file, typeName) {
  const src = fs.readFileSync(file, 'utf8')
  // Anchor on `type <Name> =` to be precise. Capture until the next blank
  // line OR until a non-union token (export, function, const, interface, etc.)
  // appears at column 0.
  const re = new RegExp(
    `\\btype\\s+${typeName}\\s*=([\\s\\S]*?)(?:\\n\\n|\\n(?:export|function|const|interface|type|class|import|\\/\\*\\*))`,
  )
  const m = src.match(re)
  if (!m) {
    throw new Error(`Could not locate union "${typeName}" in ${file}.`)
  }
  // Strip comments, extract quoted identifiers, return as Set.
  return extractQuotedIdentifiers(m[1])
}

function readTpsExtractionSourceUnion() {
  return readUnionMembers(TYPES_FILE, 'TpsExtractionSource')
}

function readWizardExtractionSourceUnion() {
  const src = fs.readFileSync(WIZARD_FILE, 'utf8')
  // New contract-as-API path: wizard aliases the shared type directly.
  if (/\btype\s+ExtractionSource\s*=\s*TpsExtractionSource\b/.test(src)) {
    return readTpsExtractionSourceUnion()
  }
  return readUnionMembers(WIZARD_FILE, 'ExtractionSource')
}

function readArbiterSourceTypeUnion() {
  return readUnionMembers(ARBITER_FILE, 'SourceType')
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

function diff(a, b) {
  const only_in_a = [...a].filter((x) => !b.has(x))
  const only_in_b = [...b].filter((x) => !a.has(x))
  return { only_in_a, only_in_b }
}

function main() {
  console.log('=== Booklet allowed-fields drift check ===')
  let server, wave1, slot
  try {
    server = readServerContractBookletAllowed()
    wave1 = readClientWave1Fields()
    slot = readClientSlotAllowedBooklet()
  } catch (e) {
    console.error('PARSE ERROR (allowed-fields):', e.message)
    console.error('A literal moved or was reshaped. Re-read the parsers in this script.')
    process.exit(2)
  }

  console.log('Server documentContracts.booklet.allowed_fields:', [...server].sort())
  console.log('Client BOOKLET_WAVE1_FIELDS:                     ', [...wave1].sort())
  console.log('Client SLOT_ALLOWED_FIELDS.booklet:              ', [...slot].sort())

  let fail = false

  const dServerWave1 = diff(server, wave1)
  if (dServerWave1.only_in_a.length || dServerWave1.only_in_b.length) {
    console.error('\n❌ DRIFT: server contract vs BOOKLET_WAVE1_FIELDS')
    if (dServerWave1.only_in_a.length) console.error('  Server allows, client wave1 drops:', dServerWave1.only_in_a)
    if (dServerWave1.only_in_b.length) console.error('  Client wave1 has fields not allowed by server:', dServerWave1.only_in_b)
    fail = true
  }

  const dServerSlot = diff(server, slot)
  if (dServerSlot.only_in_a.length || dServerSlot.only_in_b.length) {
    console.error('\n❌ DRIFT: server contract vs SLOT_ALLOWED_FIELDS.booklet')
    if (dServerSlot.only_in_a.length) console.error('  Server allows, client hydration drops:', dServerSlot.only_in_a)
    if (dServerSlot.only_in_b.length) console.error('  Client hydration has fields not allowed by server:', dServerSlot.only_in_b)
    fail = true
  }

  const dWave1Slot = diff(wave1, slot)
  if (dWave1Slot.only_in_a.length || dWave1Slot.only_in_b.length) {
    console.error('\n❌ DRIFT: BOOKLET_WAVE1_FIELDS vs SLOT_ALLOWED_FIELDS.booklet')
    console.error('  Diff:', dWave1Slot)
    fail = true
  }

  // ─────────────────────────────────────────────────────────────────
  // Source-type union membership (third leg of Session 17 bug)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== Source-type union membership ===')
  let emitted, sharedUnion, wizardUnion, arbiterUnion
  try {
    emitted = readServerEmittedSources()
    sharedUnion = readTpsExtractionSourceUnion()
    wizardUnion = readWizardExtractionSourceUnion()
    arbiterUnion = readArbiterSourceTypeUnion()
  } catch (e) {
    console.error('PARSE ERROR (source-type unions):', e.message)
    console.error('A type declaration moved or was reshaped. Re-read the parsers.')
    process.exit(2)
  }

  console.log('Server emits sources:                            ', [...emitted].sort())
  console.log('lib/tps/types.ts TpsExtractionSource union:      ', [...sharedUnion].sort())
  console.log('TPSWizardV2 local ExtractionSource union:        ', [...wizardUnion].sort())
  console.log('fieldArbiter SourceType union:                   ', [...arbiterUnion].sort())

  // Every server-emitted source MUST be a member of all three unions.
  // (Client unions are allowed to contain MORE values: user_input, manual, etc.)
  for (const [unionName, union] of [
    ['TpsExtractionSource (lib/tps/types.ts)', sharedUnion],
    ['ExtractionSource (TPSWizardV2.tsx)', wizardUnion],
    ['SourceType (fieldArbiter.ts)', arbiterUnion],
  ]) {
    const missing = [...emitted].filter((s) => !union.has(s))
    if (missing.length) {
      console.error(`\n❌ DRIFT: ${unionName} missing server-emitted sources: ${JSON.stringify(missing)}`)
      console.error('  Effect: when server emits one of these, the client union narrowing will downgrade or drop it silently.')
      fail = true
    }
  }

  if (fail) {
    console.error('\nThis is the Session 17 bug pattern. A field is being silently dropped between server response and user-visible review.')
    console.error('Fix: update the offending constant(s) AND the server contract together, then re-run.')
    console.error('Better long-term fix: refactor client filters to import from documentContracts.ts and unions to import from lib/tps/types.ts so drift becomes impossible.')
    process.exit(1)
  }

  console.log('\n✅ All allowed-field sets match AND all server-emitted sources are members of all three client unions. No drift.')
  process.exit(0)
}

main()
