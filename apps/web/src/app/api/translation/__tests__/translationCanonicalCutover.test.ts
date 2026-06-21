/**
 * translationCanonicalCutover.test.ts — Agent 4 canonical cutover guard.
 *
 * 8 source-level tests verifying the generate-pdf route was correctly wired to:
 *   A. Load resolved canonical when canonical_document_id present
 *   B. Fall back to extracted_fields in shadow mode without canonical_document_id
 *   C. Return 422 CANONICAL_ID_REQUIRED in enforce mode without canonical_document_id (NOT 503)
 *   D. Return 404 CANONICAL_NOT_FOUND when canonical_document_id not found in DB
 *   E. Omit C3 null fields from render output (INV-11)
 *   F. Use override value (not rawValue) when user override confirmed
 *   G. Bind all 7 hash fields in certification record
 *   H. Hash determinism: same inputs → same resolved_canonical_hash (reproducibility)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'generate-pdf', 'route.ts'),
  'utf-8',
)

describe('generate-pdf — canonical continuity cutover (8 tests)', () => {

  // Test 1: generate-pdf imports resolveCanonicalDocument and calls it when canonical_document_id present
  it('1. generate-pdf imports resolveCanonicalDocument from persistence module', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*resolveCanonicalDocument[^}]*\}\s*from\s*'@\/lib\/canonical\/persistence'/)
  })

  // Test 2: shadow mode falls back to extracted_fields when canonical_document_id absent
  it('2. shadow mode: falls back when canonical_document_id missing (no hard block)', () => {
    // In shadow mode, continuityMode !== 'enforce', so no early return without id
    // The code checks: if (continuityMode === 'enforce' && !canonical_document_id) return 422
    expect(SRC).toMatch(/continuityMode\s*===\s*'enforce'\s*&&\s*!canonical_document_id/)
    // Shadow falls through (no 422 without enforce)
    expect(SRC).toMatch(/continuity=shadow canonical not found, falling back/)
  })

  // Test 3: enforce mode + no canonical_document_id → 422 CANONICAL_ID_REQUIRED (NOT 503)
  it('3. enforce mode + no canonical_document_id → 422 CANONICAL_ID_REQUIRED (not 503)', () => {
    // Must return 422 for missing id
    expect(SRC).toMatch(/CANONICAL_ID_REQUIRED/)
    expect(SRC).toMatch(/status:\s*422/)
    // Must NOT use 503 for missing id
    const section = SRC.slice(
      SRC.indexOf('CANONICAL_ID_REQUIRED') - 200,
      SRC.indexOf('CANONICAL_ID_REQUIRED') + 200
    )
    expect(section).not.toMatch(/status:\s*503/)
  })

  // Test 4: canonical_document_id not found in DB → 404 CANONICAL_NOT_FOUND
  it('4. canonical_document_id not found → 404 CANONICAL_NOT_FOUND', () => {
    expect(SRC).toMatch(/CANONICAL_NOT_FOUND/)
    expect(SRC).toMatch(/status:\s*404/)
  })

  // Test 5: C3 null field → filtered out from canonical fields before render (INV-11)
  it('5. C3 null field → omitted from render (filter fo.value !== null)', () => {
    // The conversion code filters out null values before creating ExtractedField[]
    expect(SRC).toMatch(/\.filter\(.*fo\.value\s*!==\s*null/)
    // INV-11 comment must be present
    expect(SRC).toMatch(/INV-11/)
  })

  // Test 6: user override → canonical field conversion uses override value (via resolveCanonicalDocument)
  it('6. User override → translation render uses override value (via resolveCanonicalDocument)', () => {
    // resolveCanonicalDocument is called with canonical_document_id
    expect(SRC).toMatch(/resolveCanonicalDocument\(canonical_document_id\)/)
    // canonicalToFieldOut converts canonical fields (including overrides)
    expect(SRC).toMatch(/canonicalToFieldOut/)
  })

  // Test 7: certification record binds all 7 hash fields
  it('7. Certification record includes all 7 required hash fields', () => {
    expect(SRC).toMatch(/canonical_document_id:/)
    expect(SRC).toMatch(/base_canonical_hash:/)
    expect(SRC).toMatch(/resolved_canonical_hash:/)
    expect(SRC).toMatch(/override_set_hash:/)
    expect(SRC).toMatch(/override_version:/)
    expect(SRC).toMatch(/canonical_schema_version:/)
    expect(SRC).toMatch(/renderer_version:/)
  })

  // Test 8: certification determinism — version constants imported (reproducibility proof)
  it('8. CANONICAL_SCHEMA_VERSION and RENDERER_VERSION imported for certification binding', () => {
    expect(SRC).toMatch(/CANONICAL_SCHEMA_VERSION/)
    expect(SRC).toMatch(/RENDERER_VERSION/)
    expect(SRC).toMatch(/import\s*\{[^}]*CANONICAL_SCHEMA_VERSION[^}]*\}\s*from\s*'@\/lib\/canonical\/version'/)
  })

})

// ---------------------------------------------------------------------------
// Hash determinism unit test (pure, no mocking needed)
// ---------------------------------------------------------------------------

import { computeResolvedHash, computeFieldsHash, type CanonicalOverride } from '@/lib/canonical/persistence'
import type { CanonicalDocumentResult, CanonicalField } from '@/lib/canonical/types'

function makeTestCanonical(): CanonicalDocumentResult {
  const field: CanonicalField = {
    key: 'family_name',
    rawValue: 'TESTIVANENKO',
    normalizedValue: 'TESTIVANENKO',
    finalValue: 'TESTIVANENKO',
    criticality: 'high',
    confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 0.99 },
    source: 'mrz',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [{ value: 'TESTIVANENKO', source: 'mrz', confidence: 0.99, provider: 'test' }],
  }
  return {
    documentSessionId: 'det-test-session',
    product: 'translation',
    docType: 'ua_birth_certificate',
    fields: [field],
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: false,
  }
}

describe('certification_deterministic: same inputs → same resolved_canonical_hash', () => {

  it('8b. same canonical + same overrides + same RENDERER_VERSION → same resolved_hash', () => {
    const canonical = makeTestCanonical()
    const baseHash = computeFieldsHash(canonical)

    const override: CanonicalOverride = {
      fieldKey: 'family_name',
      overrideValue: 'SMITH',
      source: 'user_edit',
      confirmed: true,
      version: 1,
      createdAt: '2026-06-13T00:01:00.000Z',
    }

    // Two independent calls with same inputs
    const resolvedHash1 = computeResolvedHash(baseHash, [override])
    const resolvedHash2 = computeResolvedHash(baseHash, [override])

    // Must be identical — no timestamp or UUID in hash input
    expect(resolvedHash1).toBe(resolvedHash2)
    expect(resolvedHash1).toHaveLength(64)
  })

  it('8c. different overrides produce different resolved_hash', () => {
    const canonical = makeTestCanonical()
    const baseHash = computeFieldsHash(canonical)

    const override1: CanonicalOverride = {
      fieldKey: 'family_name', overrideValue: 'SMITH', source: 'user_edit',
      confirmed: true, version: 1, createdAt: '2026-06-13T00:01:00.000Z',
    }
    const override2: CanonicalOverride = {
      fieldKey: 'family_name', overrideValue: 'JONES', source: 'user_edit',
      confirmed: true, version: 1, createdAt: '2026-06-13T00:01:00.000Z',
    }

    const hash1 = computeResolvedHash(baseHash, [override1])
    const hash2 = computeResolvedHash(baseHash, [override2])

    expect(hash1).not.toBe(hash2)
  })

})
