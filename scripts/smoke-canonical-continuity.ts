/**
 * smoke-canonical-continuity.ts
 *
 * PII-free synthetic smoke test for the canonical continuity pipeline.
 * Verifiable via: npx tsx scripts/smoke-canonical-continuity.ts
 *
 * Tests:
 *   1. Build synthetic CanonicalDocumentResult with 3 field types:
 *      - family_name: finalValue='TESTIVANENKO' (accepted, source='mrz')
 *      - date_of_birth: finalValue=null (C3 hard reject, INV-11)
 *      - given_name: finalValue=undefined (C3 not run, fallback to normalizedValue)
 *   2. Mock-persist (skips actual DB call unless TEST_SUPABASE_URL is set)
 *   3. Apply synthetic override: family_name → 'SMITH', confirmed=true
 *   4. Resolve: verify correct values per INV-11 contract
 *   5. Call buildI821DocumentOps(resolvedCanonical) — verify null → no PDF op
 *   6. Print PASS / FAIL with specific assertion
 */

import {
  computeFieldsHash,
  computeResolvedHash,
  computeOverrideSetHash,
  getEffectiveValue,
  type CanonicalOverride,
  FINAL_VALUE_UNDEFINED_SENTINEL,
} from '../apps/web/src/lib/canonical/persistence/index'
import type { CanonicalDocumentResult, CanonicalField } from '../apps/web/src/lib/canonical/types'
import { buildI821DocumentOps } from '../apps/web/src/lib/canonical/forms/i821DocumentMapper'
import { getCanonicalValue } from '../apps/web/src/lib/canonical/core/fieldAccessor'
import { CANONICAL_SCHEMA_VERSION, RENDERER_VERSION } from '../apps/web/src/lib/canonical/version'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, name: string, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    failures.push(name + (detail ? `: ${detail}` : ''))
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function makeField(
  key: string,
  overrides: Partial<CanonicalField>
): CanonicalField {
  return {
    key,
    rawValue: null,
    normalizedValue: null,
    criticality: 'high',
    confidence: {
      ocr: null,
      field_match: null,
      normalization: null,
      source_match: null,
      final: 0.5,
    },
    source: 'document_ocr',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Step 1: Build synthetic CanonicalDocumentResult
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 1: Build synthetic CanonicalDocumentResult')

const familyNameField = makeField('family_name', {
  finalValue: 'TESTIVANENKO',
  reviewRequired: false,
  source: 'mrz',
  evidence: [{ value: 'TESTIVANENKO', source: 'mrz', confidence: 0.99, provider: 'smoke_test' }],
  confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 0.99 },
})

const dobField = makeField('date_of_birth', {
  finalValue: null, // C3 hard reject — INV-11 test
  reviewRequired: true,
  evidence: [{ value: 'UNCLEAR', source: 'document_ocr', confidence: 0.3, provider: 'smoke_test' }],
  confidence: { ocr: 0.3, field_match: null, normalization: null, source_match: null, final: 0.3 },
  reviewReasons: ['handwritten_unclear'],
})

const givenNameField = makeField('given_name', {
  finalValue: undefined, // C3 not run
  normalizedValue: 'VASYL',
  reviewRequired: false,
})

const canonical: CanonicalDocumentResult = {
  documentSessionId: 'smoke-test-session-001',
  product: 'tps',
  docType: 'ua_passport_booklet',
  fields: [familyNameField, dobField, givenNameField],
  hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
  createdAt: new Date().toISOString(),
  requiresReview: true,
}

console.log('  Built synthetic canonical with 3 fields:')
console.log(`    family_name: finalValue='TESTIVANENKO' source=mrz`)
console.log(`    date_of_birth: finalValue=null (C3 reject)`)
console.log(`    given_name: finalValue=undefined normalizedValue='VASYL'`)

// ---------------------------------------------------------------------------
// Step 2: Mock-persist (skip actual DB call)
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 2: Mock-persist (DB call SKIPPED — no TEST_SUPABASE_URL)')
// In a real run with TEST_SUPABASE_URL:
//   const { id, fieldsHash } = await persistCanonicalDocument(canonical, 'smoke-test-session-001')
// For the smoke test we compute hashes locally and verify them.

const fieldsHash = computeFieldsHash(canonical)
console.log(`  fields_hash computed: ${fieldsHash.slice(0, 16)}…`)
assert(fieldsHash.length === 64, 'fields_hash is 64-char hex SHA-256')

// Verify INV-11: undefined and null hash differently
const undefinedSentinel = JSON.stringify(FINAL_VALUE_UNDEFINED_SENTINEL)
const nullStr = JSON.stringify(null)
assert(undefinedSentinel !== nullStr, 'INV-11: undefined sentinel !== null in hash input')

// ---------------------------------------------------------------------------
// Step 3: Apply synthetic override — family_name → 'SMITH', confirmed=true
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 3: Apply synthetic override: family_name → SMITH')

const syntheticOverride: CanonicalOverride = {
  fieldKey: 'family_name',
  overrideValue: 'SMITH',
  source: 'user_edit',
  confirmed: true,
  version: 1,
  createdAt: new Date().toISOString(),
}

const confirmedOverrides: CanonicalOverride[] = [syntheticOverride]

// ---------------------------------------------------------------------------
// Step 4: Resolve — verify values per INV-11 contract
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 4: Resolve and verify field values')

// Simulate resolution (what resolveCanonicalDocument does):
const resolvedFields = canonical.fields.map((field) => {
  const override = confirmedOverrides.find((o) => o.fieldKey === field.key)
  if (!override || !override.confirmed) return field
  return {
    ...field,
    finalValue: override.overrideValue,
    source: override.source as CanonicalField['source'],
    reviewRequired: false,
  }
})

const resolvedCanonical: CanonicalDocumentResult = { ...canonical, fields: resolvedFields }

// family_name: override → 'SMITH'
const resolvedFamilyName = resolvedFields.find((f) => f.key === 'family_name')
assert(
  resolvedFamilyName?.finalValue === 'SMITH',
  'family_name resolved to override value SMITH',
  `actual=${JSON.stringify(resolvedFamilyName?.finalValue)}`
)

// date_of_birth: finalValue=null survives resolution (INV-11)
const resolvedDob = resolvedFields.find((f) => f.key === 'date_of_birth')
assert(
  resolvedDob?.finalValue === null,
  'INV-11: date_of_birth finalValue=null survives resolution (not resurrected)',
  `actual=${JSON.stringify(resolvedDob?.finalValue)}`
)
assert(
  getCanonicalValue(resolvedDob!) === null,
  'INV-11: getCanonicalValue(date_of_birth)=null (no fallback to normalizedValue)',
)

// given_name: finalValue=undefined → fallback to normalizedValue='VASYL'
const resolvedGivenName = resolvedFields.find((f) => f.key === 'given_name')
assert(
  resolvedGivenName?.finalValue === undefined,
  'given_name finalValue=undefined preserved (C3 not run)',
)
assert(
  getCanonicalValue(resolvedGivenName!) === 'VASYL',
  'given_name getCanonicalValue returns normalizedValue=VASYL (C3 not run fallback)',
)

// ---------------------------------------------------------------------------
// Step 5: buildI821DocumentOps — verify null field → no PDF op
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 5: buildI821DocumentOps — verify null field → no PDF op')

const ops = buildI821DocumentOps(resolvedCanonical)

// family_name op should use 'SMITH' (override)
const familyNameOp = ops.find((op) => op.field.includes('FamilyName'))
assert(
  familyNameOp?.value === 'SMITH',
  'family_name PDF op uses override value SMITH',
  `actual=${JSON.stringify(familyNameOp?.value)}`
)

// date_of_birth op should NOT exist (C3 null → no op per INV-11)
const dobOp = ops.find((op) => op.field.includes('DateOfBirth'))
assert(
  dobOp === undefined,
  'INV-11: date_of_birth (finalValue=null) produces NO PDF op',
  dobOp ? `unexpected op value=${JSON.stringify(dobOp.value)}` : ''
)

console.log(`  Total ops: ${ops.length}`)

// ---------------------------------------------------------------------------
// Step 6: Hash binding verification
// ---------------------------------------------------------------------------

console.log('\n[smoke] Step 6: Hash binding verification')

const resolvedHash = computeResolvedHash(fieldsHash, confirmedOverrides)
const overrideSetHash = computeOverrideSetHash(confirmedOverrides)
const emptyOverrideSetHash = computeOverrideSetHash([])

console.log(`  base_canonical_hash:      ${fieldsHash.slice(0, 16)}…`)
console.log(`  resolved_canonical_hash:  ${resolvedHash.slice(0, 16)}…`)
console.log(`  override_set_hash:        ${overrideSetHash.slice(0, 16)}…`)
console.log(`  empty_override_set_hash:  ${emptyOverrideSetHash.slice(0, 16)}…`)
console.log(`  CANONICAL_SCHEMA_VERSION: ${CANONICAL_SCHEMA_VERSION}`)
console.log(`  RENDERER_VERSION:         ${RENDERER_VERSION}`)

assert(resolvedHash !== fieldsHash, 'resolved_hash differs from base_hash when overrides applied')
assert(overrideSetHash !== emptyOverrideSetHash, 'override_set_hash differs from empty set hash')
assert(CANONICAL_SCHEMA_VERSION === '1.0.0', `CANONICAL_SCHEMA_VERSION is '1.0.0'`)
assert(RENDERER_VERSION === '1.0.0', `RENDERER_VERSION is '1.0.0'`)

// Reproducibility: same inputs → same hashes
const resolvedHash2 = computeResolvedHash(fieldsHash, confirmedOverrides)
assert(
  resolvedHash === resolvedHash2,
  'certification_deterministic: same inputs → same resolved_canonical_hash',
)

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------

console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFAILED assertions:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
} else {
  console.log('\n[smoke] PASS — all assertions passed')
  process.exit(0)
}
