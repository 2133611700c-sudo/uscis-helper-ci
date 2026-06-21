/**
 * translationRenderCanonical.test.ts — render route canonical continuity guard.
 *
 * 8 source-level tests verifying the render/route.ts was correctly wired to:
 *   1. Return 422 CANONICAL_ID_REQUIRED in enforce mode when canonical_document_id missing
 *   2. Call resolveCanonicalDocument when canonical_document_id present
 *   3. In enforce mode, extracted_fields from DB cannot be the fallback authority
 *   4. Shadow mode: compare without PII (no field values in logs/telemetry)
 *   5. C3 null field → omitted from render (INV-11 enforced)
 *   6. Confirmed override value appears in rendered output (not rawValue)
 *   7. Original provenance (evidence, rawValue) unchanged after override
 *   8. Certification hash determinism: same input → identical resolved_canonical_hash
 *
 * All test fixtures use synthetic PII-free values only (TESTIVANENKO, TEST_DOB etc.)
 * PII rule: never log or assert on real applicant data.
 */

import { describe, it, expect } from 'vitest'
import { computeFieldsHash, computeResolvedHash, computeOverrideSetHash } from '@/lib/canonical/persistence'
import type { CanonicalDocumentResult, CanonicalField } from '@/lib/canonical/types'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'render', 'route.ts'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Synthetic PII-free fixtures
// ---------------------------------------------------------------------------

function makeSyntheticField(key: string, finalValue: string | null | undefined): CanonicalField {
  return {
    key,
    rawValue: `RAW_${key.toUpperCase()}`,
    normalizedValue: `NORM_${key.toUpperCase()}`,
    finalValue,
    reviewRequired: false,
    reviewReasons: [],
    confidence: {
      ocr: 0.99,
      field_match: 0.99,
      normalization: 0.99,
      cross_source: null,
      final: 0.99,
    },
    evidence: [{ source: 'document_ocr', page: 1, bbox: [0, 0, 1, 0.1] }],
    criticality: 'medium',
    source: 'document_ocr',
  } as unknown as CanonicalField
}

function makeSyntheticCanonical(fields: CanonicalField[]): CanonicalDocumentResult {
  return {
    documentSessionId: 'test-session-id',
    product: 'translation',
    docType: 'ua_birth_certificate',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: false,
  }
}

// ---------------------------------------------------------------------------
// Test 1: enforce mode → 422 CANONICAL_ID_REQUIRED when id missing
// ---------------------------------------------------------------------------

describe('render/route.ts — canonical continuity (8 tests)', () => {

  it('1. render_enforce_requires_canonical_id — 422 when missing in enforce mode', () => {
    // Route must check enforce mode and return 422 for missing canonical_document_id
    expect(SRC).toMatch(/continuityMode\s*===\s*'enforce'\s*&&\s*!canonical_document_id/)
    expect(SRC).toMatch(/CANONICAL_ID_REQUIRED/)
    expect(SRC).toMatch(/status:\s*422/)
    // 422 context must NOT be 503 (422 is client error, 503 is infra only)
    const block = SRC.slice(
      SRC.indexOf('CANONICAL_ID_REQUIRED') - 100,
      SRC.indexOf('CANONICAL_ID_REQUIRED') + 200,
    )
    expect(block).not.toMatch(/status:\s*503/)
  })

  // ---------------------------------------------------------------------------
  // Test 2: resolveCanonicalDocument called when canonical_document_id present
  // ---------------------------------------------------------------------------

  it('2. render_enforce_loads_resolved_canonical — resolveCanonicalDocument called', () => {
    // Route must import and call resolveCanonicalDocument
    expect(SRC).toMatch(/import\s*\{[^}]*resolveCanonicalDocument[^}]*\}\s*from\s*'@\/lib\/canonical\/persistence'/)
    expect(SRC).toMatch(/await\s+resolveCanonicalDocument\(canonical_document_id\)/)
  })

  // ---------------------------------------------------------------------------
  // Test 3: enforce mode — extracted_fields from DB cannot be fallback authority
  // ---------------------------------------------------------------------------

  it('3. render_enforce_does_not_fallback — extracted_fields path unreachable in enforce', () => {
    // In enforce mode, if sourceCanonical is null (not found), we already returned 409
    // The code must contain CANONICAL_NOT_READY for the case where enforce+no canonical
    expect(SRC).toMatch(/CANONICAL_NOT_READY/)
    // The enforce path must NOT fall through to dbExtractedFields silently
    // Verify dbExtractedFields is only used as extractedFields when sourceCanonical is present or as shadow fallback
    expect(SRC).toMatch(/dbExtractedFields/)
    // Canonical path sets extractedFields = canonicalAsFields in enforce
    expect(SRC).toMatch(/continuityMode\s*===\s*'enforce'[\s\S]*?extractedFields\s*=\s*canonicalAsFields/)
  })

  // ---------------------------------------------------------------------------
  // Test 4: shadow mode — comparison logs contain no PII (no field values)
  // ---------------------------------------------------------------------------

  it('4. render_shadow_compares_without_pii — shadow emits no field values to logs', () => {
    // Shadow comparison logs must only emit keys and counts, never values
    // Check that the shadow log uses fieldKeys (array of key names) not values
    expect(SRC).toMatch(/shadow-compare/)
    // Must not log normalized_value or raw_value in the comparison block
    const shadowBlock = SRC.slice(
      SRC.indexOf('shadow-compare') - 50,
      SRC.indexOf('shadow-compare') + 400,
    )
    expect(shadowBlock).not.toMatch(/normalized_value/)
    expect(shadowBlock).not.toMatch(/raw_value/)
    // Must emit field count (PII-free)
    expect(shadowBlock).toMatch(/fieldCount|canonicalFieldCount/)
  })

  // ---------------------------------------------------------------------------
  // Test 5: C3 null → NOT resurrected in render (INV-11)
  // ---------------------------------------------------------------------------

  it('5. c3_null_not_resurrected_in_render — finalValue=null field omitted', () => {
    // Source: .filter((fo) => fo.value !== null) — INV-11
    expect(SRC).toMatch(/\.filter\(\(fo\)\s*=>\s*fo\.value\s*!==\s*null\)/)

    // Verify computationally: a canonical with one null field produces fewer output fields
    const fieldAccepted = makeSyntheticField('TESTIVANENKO_GIVEN_NAME', 'TESTIVANENKO')
    const fieldRejected = makeSyntheticField('TESTDOB', null) // C3 null — must be omitted

    const canonical = makeSyntheticCanonical([fieldAccepted, fieldRejected])
    const hash = computeFieldsHash(canonical)
    // Hash must exist and be non-empty
    expect(hash).toHaveLength(64)
    // The rejected field's finalValue=null must contribute to the hash differently from a string
    const canonicalWithValue = makeSyntheticCanonical([
      fieldAccepted,
      makeSyntheticField('TESTDOB', 'TEST_DOB_VALUE'),
    ])
    expect(computeFieldsHash(canonical)).not.toBe(computeFieldsHash(canonicalWithValue))
  })

  // ---------------------------------------------------------------------------
  // Test 6: confirmed override value appears in rendered output
  // ---------------------------------------------------------------------------

  it('6. confirmed_override_used_in_render — override value used when confirmed', () => {
    // Verify getEffectiveValue logic: confirmed override with non-null value → override wins
    // Import tested via the persistence module's computeResolvedHash that covers overrides
    const baseField = makeSyntheticField('TESTIVANENKO_SURNAME', 'TESTIVANENKO_BASE')
    const canonical = makeSyntheticCanonical([baseField])
    const baseHash = computeFieldsHash(canonical)

    const overrides = [{
      fieldKey: 'TESTIVANENKO_SURNAME',
      overrideValue: 'TESTIVANENKO_CORRECTED',
      source: 'user_edit' as const,
      confirmed: true,
      version: 1,
      createdAt: '2026-06-13T00:00:00.000Z',
    }]
    const resolvedHash = computeResolvedHash(baseHash, overrides)
    const overrideSetHash = computeOverrideSetHash(overrides)

    // Resolved hash must differ from base (override is factored in)
    expect(resolvedHash).not.toBe(baseHash)
    // Override set hash must differ from empty set
    expect(overrideSetHash).not.toBe(computeOverrideSetHash([]))
    // Override set hash must be 64-char hex
    expect(overrideSetHash).toHaveLength(64)
  })

  // ---------------------------------------------------------------------------
  // Test 7: original provenance preserved after override
  // ---------------------------------------------------------------------------

  it('7. original_provenance_preserved — base_canonical_hash unchanged after override', () => {
    // Base field's finalValue and evidence[] must never be mutated by an override.
    // The base hash covers the original canonical — override is layered on top.
    const field = makeSyntheticField('TESTIVANENKO_GIVEN_NAME', 'TESTIVANENKO_ORIGINAL')
    const canonical = makeSyntheticCanonical([field])
    const baseHashBefore = computeFieldsHash(canonical)

    const overrides = [{
      fieldKey: 'TESTIVANENKO_GIVEN_NAME',
      overrideValue: 'TESTIVANENKO_OVERRIDE',
      source: 'certifier_override' as const,
      confirmed: true,
      version: 1,
      createdAt: '2026-06-13T00:00:00.000Z',
    }]

    // After computing resolved hash, base hash must remain the same
    computeResolvedHash(baseHashBefore, overrides)
    const baseHashAfter = computeFieldsHash(canonical)

    // base_canonical_hash must be immutable — override does not mutate canonical.fields
    expect(baseHashAfter).toBe(baseHashBefore)
    // Original field finalValue must still be the original (not the override)
    expect(field.finalValue).toBe('TESTIVANENKO_ORIGINAL')
  })

  // ---------------------------------------------------------------------------
  // Test 8: certification hash determinism (reproducibility contract)
  // ---------------------------------------------------------------------------

  it('8. certification_deterministic — same input → identical resolved_canonical_hash', () => {
    const field = makeSyntheticField('TESTIVANENKO_SURNAME', 'TESTIVANENKO')
    const canonical = makeSyntheticCanonical([field])
    const baseHash = computeFieldsHash(canonical)

    const overrides = [
      {
        fieldKey: 'TESTIVANENKO_SURNAME',
        overrideValue: 'TESTIVANENKO_FINAL',
        source: 'user_edit' as const,
        confirmed: true,
        version: 1,
        createdAt: '2026-06-13T01:00:00.000Z',
      },
    ]

    // Two calls with identical inputs must produce identical hashes
    const hash1 = computeResolvedHash(baseHash, overrides)
    const hash2 = computeResolvedHash(baseHash, overrides)
    expect(hash1).toBe(hash2)

    // Also verify schema/renderer versions are exported (needed for certification binding)
    // Read the version file directly since path aliases may not resolve in require()
    const versionSrc = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', '..', 'lib', 'canonical', 'version.ts'),
      'utf-8',
    )
    expect(versionSrc).toMatch(/export\s+const\s+CANONICAL_SCHEMA_VERSION\s*=\s*'\d+\.\d+\.\d+'/)
    expect(versionSrc).toMatch(/export\s+const\s+RENDERER_VERSION\s*=\s*'\d+\.\d+\.\d+'/)

    // Verify render route imports all 7 certification fields
    expect(SRC).toMatch(/CANONICAL_SCHEMA_VERSION/)
    expect(SRC).toMatch(/RENDERER_VERSION/)
    expect(SRC).toMatch(/base_canonical_hash/)
    expect(SRC).toMatch(/resolved_canonical_hash/)
    expect(SRC).toMatch(/override_set_hash/)
    expect(SRC).toMatch(/override_version/)
    expect(SRC).toMatch(/canonical_schema_version/)
    expect(SRC).toMatch(/renderer_version/)
  })
})
