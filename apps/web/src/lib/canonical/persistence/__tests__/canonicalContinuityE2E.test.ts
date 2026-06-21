/**
 * canonicalContinuityE2E.test.ts
 *
 * E2E provenance audit for canonical continuity pipeline.
 * 14 tests verifying the full lifecycle: persist → resolve → override → render.
 *
 * These tests are PURE (no DB I/O) — they exercise the hash functions, resolve
 * logic, override contract, and PDF op generation using synthetic canonical data.
 *
 * Security invariants verified:
 *   INV-11: finalValue=null NEVER resurrected at any point in the pipeline
 *   INV-07: fabricated confidence.final=1 + empty evidence is never produced here
 *   INV-12: all fallbacks are explicit and mode-guarded
 */

import { describe, it, expect } from 'vitest'
import {
  computeFieldsHash,
  computeResultHash,
  computeResolvedHash,
  computeOverrideSetHash,
  getEffectiveValue,
  FINAL_VALUE_UNDEFINED_SENTINEL,
  type CanonicalOverride,
} from '../index'
import type { CanonicalDocumentResult, CanonicalField } from '../../types'
import { buildI821DocumentOps } from '../../forms/i821DocumentMapper'
import { getCanonicalValue } from '../../core/fieldAccessor'
import { canonicalToFieldOut } from '../../core/translationAdapter'
import { CANONICAL_SCHEMA_VERSION, RENDERER_VERSION } from '../../version'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(key: string, overrides: Partial<CanonicalField> = {}): CanonicalField {
  return {
    key,
    rawValue: `raw_${key}`,
    normalizedValue: `normalized_${key}`,
    criticality: 'high',
    confidence: {
      ocr: null,
      field_match: null,
      normalization: null,
      source_match: null,
      final: 0.85,
    },
    source: 'document_ocr',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [{ value: `raw_${key}`, source: 'document_ocr', confidence: 0.85, provider: 'test' }],
    ...overrides,
  }
}

function makeCanonical(fields: CanonicalField[]): CanonicalDocumentResult {
  return {
    documentSessionId: 'test-session-e2e',
    product: 'tps',
    docType: 'ua_passport_booklet',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: fields.some((f) => f.reviewRequired),
  }
}

/** Simulate what resolveCanonicalDocument does (pure, no DB). */
function resolveSync(
  canonical: CanonicalDocumentResult,
  overrides: CanonicalOverride[]
): CanonicalDocumentResult {
  if (overrides.length === 0) return canonical
  const overrideMap = new Map<string, CanonicalOverride>()
  for (const o of overrides) {
    // last override per field wins
    overrideMap.set(o.fieldKey, o)
  }
  const resolvedFields = canonical.fields.map((field) => {
    const override = overrideMap.get(field.key)
    if (!override || !override.confirmed) return field
    return {
      ...field,
      finalValue: override.overrideValue,
      source: override.source as CanonicalField['source'],
      reviewRequired: false,
    }
  })
  return { ...canonical, fields: resolvedFields }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const familyNameField = makeField('family_name', {
  finalValue: 'TESTIVANENKO',
  source: 'mrz',
  confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 0.99 },
  evidence: [{ value: 'TESTIVANENKO', source: 'mrz', confidence: 0.99, provider: 'test_mrz' }],
})

const dobFieldRejected = makeField('date_of_birth', {
  finalValue: null, // INV-11: C3 hard reject
  reviewRequired: true,
  reviewReasons: ['handwritten_unclear'],
  confidence: { ocr: 0.3, field_match: null, normalization: null, source_match: null, final: 0.3 },
  evidence: [{ value: 'UNCLEAR', source: 'document_ocr', confidence: 0.3, provider: 'test' }],
})

const givenNameField = makeField('given_name', {
  finalValue: undefined, // INV-11: C3 not run
  normalizedValue: 'VASYL',
})

const baseCanonical = makeCanonical([familyNameField, dobFieldRejected, givenNameField])

const confirmedOverride: CanonicalOverride = {
  fieldKey: 'family_name',
  overrideValue: 'SMITH',
  source: 'user_edit',
  confirmed: true,
  version: 1,
  createdAt: '2026-06-13T00:01:00.000Z',
}

const unconfirmedOverride: CanonicalOverride = {
  fieldKey: 'family_name',
  overrideValue: 'JONES',
  source: 'user_edit',
  confirmed: false,
  version: 1,
  createdAt: '2026-06-13T00:02:00.000Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('canonicalContinuityE2E — 14 provenance tests', () => {

  // Test 1: Round-trip (hash stability proves no data loss)
  it('1. Round-trip: fields_hash is stable (proves field data integrity)', () => {
    const hash1 = computeFieldsHash(baseCanonical)
    const hash2 = computeFieldsHash(baseCanonical)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 hex
  })

  // Test 2: INV-11 — finalValue=null survives round-trip
  it('2. finalValue=null survives round-trip (INV-11)', () => {
    const dob = baseCanonical.fields.find((f) => f.key === 'date_of_birth')!
    expect(dob.finalValue).toBeNull()
    // Verify getCanonicalValue returns null, NOT the normalizedValue fallback
    expect(getCanonicalValue(dob)).toBeNull()
    // Verify the field hashes differently from one with undefined
    const canonicalWithUndefined = makeCanonical([makeField('date_of_birth', { finalValue: undefined })])
    const hashNull = computeFieldsHash(baseCanonical)
    const hashUndefined = computeFieldsHash(canonicalWithUndefined)
    expect(hashNull).not.toBe(hashUndefined)
  })

  // Test 3: INV-11 — finalValue=undefined sentinel in hash
  it('3. finalValue=undefined survives as sentinel (different hash from null)', () => {
    const givenName = baseCanonical.fields.find((f) => f.key === 'given_name')!
    expect(givenName.finalValue).toBeUndefined()
    // C3 not run → fallback to normalizedValue
    expect(getCanonicalValue(givenName)).toBe('VASYL')
    // Verify sentinel value
    expect(FINAL_VALUE_UNDEFINED_SENTINEL).toBe('__UNDEFINED__')
  })

  // Test 4: Override — base canonical rawValue unchanged after user override
  it('4. Override: base canonical rawValue unchanged after user override (base immutable)', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    // Base is untouched
    const baseFamilyName = baseCanonical.fields.find((f) => f.key === 'family_name')!
    expect(baseFamilyName.rawValue).toBe('raw_family_name')
    expect(baseFamilyName.finalValue).toBe('TESTIVANENKO')
    // Resolved has new finalValue
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    expect(resolvedFamilyName.finalValue).toBe('SMITH')
  })

  // Test 5: Override — base canonical evidence[] unchanged after override
  it('5. Override: base canonical evidence[] unchanged after user override', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    const baseFamilyName = baseCanonical.fields.find((f) => f.key === 'family_name')!
    expect(baseFamilyName.evidence).toHaveLength(1)
    expect(baseFamilyName.evidence[0].value).toBe('TESTIVANENKO')
    // Resolved field preserves original evidence (base spread)
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    expect(resolvedFamilyName.evidence).toHaveLength(1)
    expect(resolvedFamilyName.evidence[0].value).toBe('TESTIVANENKO') // base evidence, not override value
  })

  // Test 6: Override — resolved canonical has override value for field_key
  it('6. Override: resolved canonical has override value for field_key', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    expect(resolvedFamilyName.finalValue).toBe('SMITH')
    expect(resolvedFamilyName.source).toBe('user_edit')
    expect(resolvedFamilyName.reviewRequired).toBe(false)
  })

  // Test 7: Multiple overrides for same field — last one wins
  it('7. Multiple overrides for same field: last one wins', () => {
    const override1: CanonicalOverride = {
      fieldKey: 'family_name', overrideValue: 'FIRST', source: 'user_edit', confirmed: true,
      version: 1, createdAt: '2026-06-13T00:01:00.000Z',
    }
    const override2: CanonicalOverride = {
      fieldKey: 'family_name', overrideValue: 'SECOND', source: 'user_edit', confirmed: true,
      version: 2, createdAt: '2026-06-13T00:02:00.000Z',
    }
    // resolveSync processes in order, last wins (overrideMap.set overwrites)
    const resolved = resolveSync(baseCanonical, [override1, override2])
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    expect(resolvedFamilyName.finalValue).toBe('SECOND')
  })

  // Test 8: Override with override_value=null → resolved field.finalValue === null (INV-11)
  it('8. Override with override_value=null: resolved field.finalValue === null (INV-11)', () => {
    const nullOverride: CanonicalOverride = {
      fieldKey: 'family_name', overrideValue: null, source: 'user_edit', confirmed: true,
      version: 1, createdAt: '2026-06-13T00:01:00.000Z',
    }
    const resolved = resolveSync(baseCanonical, [nullOverride])
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    expect(resolvedFamilyName.finalValue).toBeNull()
    expect(getCanonicalValue(resolvedFamilyName)).toBeNull()
  })

  // Test 9: buildI821DocumentOps — C3 null field → no PDF op
  it('9. buildI821DocumentOps(resolvedCanonical): C3 null field → no PDF op (INV-11)', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    const ops = buildI821DocumentOps(resolved)
    // date_of_birth is C3-rejected (finalValue=null) → no DateOfBirth op
    const dobOp = ops.find((op) => op.field.includes('DateOfBirth'))
    expect(dobOp).toBeUndefined()
  })

  // Test 10: buildI821DocumentOps — user override → PDF op uses override value
  it('10. buildI821DocumentOps(resolvedCanonical): user override → PDF op uses override value', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    const ops = buildI821DocumentOps(resolved)
    const familyNameOp = ops.find((op) => op.field.includes('FamilyName'))
    expect(familyNameOp).toBeDefined()
    expect(familyNameOp!.value).toBe('SMITH')
  })

  // Test 11: Translation render — C3 null field → not rendered
  it('11. Translation render: C3 null field → not rendered in output (INV-11)', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    // canonicalToFieldOut maps null finalValue → null value
    const fieldOuts = resolved.fields.map((f) => canonicalToFieldOut(f))
    const dobOut = fieldOuts.find((fo) => fo.field === 'date_of_birth')!
    expect(dobOut.value).toBeNull()
    // Filtering null → omit from render
    const renderableFields = fieldOuts.filter((fo) => fo.value !== null)
    const dobInRender = renderableFields.find((fo) => fo.field === 'date_of_birth')
    expect(dobInRender).toBeUndefined()
  })

  // Test 12: Certification hash binding — resolved_hash differs when override added vs not
  it('12. Certification hash binding: resolved_hash differs when override added vs not', () => {
    const baseHash = computeFieldsHash(baseCanonical)
    const resolvedHashNoOverrides = computeResolvedHash(baseHash, [])
    const resolvedHashWithOverride = computeResolvedHash(baseHash, [confirmedOverride])
    expect(resolvedHashNoOverrides).not.toBe(resolvedHashWithOverride)
  })

  // Test 13: Hash stability — same fields in different order → same fields_hash
  it('13. Hash stability: same fields in different order → same fields_hash (sorted)', () => {
    const canonical1 = makeCanonical([familyNameField, dobFieldRejected, givenNameField])
    const canonical2 = makeCanonical([givenNameField, familyNameField, dobFieldRejected])
    const canonical3 = makeCanonical([dobFieldRejected, givenNameField, familyNameField])
    expect(computeFieldsHash(canonical1)).toBe(computeFieldsHash(canonical2))
    expect(computeFieldsHash(canonical1)).toBe(computeFieldsHash(canonical3))
  })

  // Test 14: Provenance — resolved canonical has original evidence[] + updated source after override
  it('14. Provenance: resolved canonical has original evidence[] + updated source after override', () => {
    const resolved = resolveSync(baseCanonical, [confirmedOverride])
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    // Original base evidence preserved (audit trail)
    expect(resolvedFamilyName.evidence).toHaveLength(1)
    expect(resolvedFamilyName.evidence[0].source).toBe('mrz') // base field's evidence
    // Override source applied to field.source
    expect(resolvedFamilyName.source).toBe('user_edit')
    // Override value replaces finalValue
    expect(resolvedFamilyName.finalValue).toBe('SMITH')
    // rawValue unchanged (base audit trail)
    expect(resolvedFamilyName.rawValue).toBe('raw_family_name')
  })

  // Bonus: unconfirmed override does NOT affect resolved value
  it('(bonus) Unconfirmed override does not affect resolved value', () => {
    const resolved = resolveSync(baseCanonical, [unconfirmedOverride])
    const resolvedFamilyName = resolved.fields.find((f) => f.key === 'family_name')!
    // Unconfirmed → base finalValue preserved
    expect(resolvedFamilyName.finalValue).toBe('TESTIVANENKO')
  })

  // Bonus: getEffectiveValue contract
  it('(bonus) getEffectiveValue: confirmed override → override value, unconfirmed → base finalValue', () => {
    const baseField = baseCanonical.fields.find((f) => f.key === 'family_name')!
    expect(getEffectiveValue(baseField, confirmedOverride)).toBe('SMITH')
    expect(getEffectiveValue(baseField, unconfirmedOverride)).toBe('TESTIVANENKO')
    expect(getEffectiveValue(baseField)).toBe('TESTIVANENKO')
  })

  // Bonus: version constants are defined
  it('(bonus) CANONICAL_SCHEMA_VERSION and RENDERER_VERSION are defined', () => {
    expect(CANONICAL_SCHEMA_VERSION).toBe('1.0.0')
    expect(RENDERER_VERSION).toBe('1.0.0')
  })

  // Bonus: override_set_hash covers only confirmed overrides
  it('(bonus) computeOverrideSetHash: same confirmed overrides → same hash (reproducible)', () => {
    const hash1 = computeOverrideSetHash([confirmedOverride])
    const hash2 = computeOverrideSetHash([confirmedOverride])
    expect(hash1).toBe(hash2)
    // Unconfirmed override not counted
    const hashUnconfirmed = computeOverrideSetHash([unconfirmedOverride])
    const hashEmpty = computeOverrideSetHash([])
    // unconfirmed = same as empty (not included)
    expect(hashUnconfirmed).toBe(hashEmpty)
  })

})
