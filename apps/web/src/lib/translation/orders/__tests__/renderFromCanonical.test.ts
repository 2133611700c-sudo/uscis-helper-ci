/**
 * renderFromCanonical.test.ts — V2 canonical render evidence (Phase 2, Agent 2).
 *
 * Covers test classes:
 *   10 operator override appears in resolved canonical (effective render value)
 *   11 base canonical unchanged after override
 *   12 final PDF generated from RESOLVED canonical (not fabricated fields)
 *   13 seven certification fields populated
 *   14 artifact bytes match stored hash (sha256 of the exact bytes)
 *   17 C3-null field NOT rendered without a confirmed override (INV-11)
 *
 * All fixtures are synthetic PII-free values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import type { CanonicalDocumentResult, CanonicalField } from '@/lib/canonical/types'
import type { CanonicalOverride } from '@/lib/canonical/persistence'

// ── Synthetic fixtures ─────────────────────────────────────────────────────────
function field(key: string, finalValue: string | null | undefined): CanonicalField {
  return {
    key,
    rawValue: `RAW_${key}`,
    normalizedValue: `NORM_${key}`,
    finalValue,
    reviewRequired: false,
    reviewReasons: [],
    confidence: { ocr: 0.9, field_match: 0.9, normalization: 0.9, cross_source: null, final: 0.9 },
    evidence: [{ source: 'document_ocr', value: `RAW_${key}`, confidence: 0.9, provider: 'test' }],
    criticality: 'medium',
    source: 'document_ocr',
  } as unknown as CanonicalField
}

function doc(fields: CanonicalField[]): CanonicalDocumentResult {
  return {
    documentSessionId: 'sess',
    product: 'translation',
    docType: 'ua_birth_certificate',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: false,
  }
}

// Mutable test state captured by the persistence mock.
const state: {
  base: CanonicalDocumentResult
  resolved: CanonicalDocumentResult
  overrides: CanonicalOverride[]
} = {
  base: doc([]),
  resolved: doc([]),
  overrides: [],
}

let capturedFields: Array<{ field: string; normalized_value: string; final_value?: string | null }> = []

vi.mock('@/lib/canonical/persistence', async () => {
  const actual = await vi.importActual<typeof import('@/lib/canonical/persistence')>(
    '@/lib/canonical/persistence',
  )
  return {
    ...actual, // keep REAL hash functions — proves determinism end-to-end
    loadCanonicalDocumentById: vi.fn(async () => state.base),
    resolveCanonicalDocument: vi.fn(async () => state.resolved),
    listCanonicalOverrides: vi.fn(async () => state.overrides),
  }
})

vi.mock('@/lib/packet/pdf', () => ({
  generateTranslationPDF: vi.fn(async (input: { fields: typeof capturedFields }) => {
    capturedFields = input.fields
    // Deterministic synthetic "PDF" bytes derived from the field values so the
    // sha is stable and testable.
    return Buffer.from('PDF::' + JSON.stringify(input.fields))
  }),
}))

vi.mock('@/lib/translation/certificationRecord', () => ({
  buildCertificationRecord: vi.fn(() => ({ signer_full_name: 'TEST SIGNER' })),
}))

import { renderFromCanonical, CanonicalRenderError } from '../renderFromCanonical'
import { computeFieldsHash } from '@/lib/canonical/persistence'

beforeEach(() => {
  process.env.OPERATOR_SIGNER_NAME = 'TEST SIGNER'
  capturedFields = []
})

describe('renderFromCanonical (Phase 2 V2 render)', () => {
  it('test 10/12: operator override is the effective rendered value (not base)', async () => {
    const base = doc([field('first_name', 'IVAN')])
    const resolved = doc([{ ...field('first_name', 'IVAN'), finalValue: 'IVAN_CORRECTED' } as CanonicalField])
    state.base = base
    state.resolved = resolved
    state.overrides = [
      { fieldKey: 'first_name', overrideValue: 'IVAN_CORRECTED', source: 'operator_override' as unknown as CanonicalOverride['source'], confirmed: true, version: 1, createdAt: '2026-06-13T01:00:00Z' },
    ]

    const out = await renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'ua_birth_certificate', sessionRef: 'o1' })
    const fn = capturedFields.find((f) => f.field === 'first_name')
    expect(fn?.final_value).toBe('IVAN_CORRECTED')
    expect(out.renderedKeys).toContain('first_name')
  })

  it('test 11: base canonical fields_hash is unchanged by the override', async () => {
    const base = doc([field('first_name', 'IVAN')])
    state.base = base
    state.resolved = doc([{ ...field('first_name', 'IVAN'), finalValue: 'IVAN_CORRECTED' } as CanonicalField])
    state.overrides = [
      { fieldKey: 'first_name', overrideValue: 'IVAN_CORRECTED', source: 'operator_override' as unknown as CanonicalOverride['source'], confirmed: true, version: 1, createdAt: '2026-06-13T01:00:00Z' },
    ]
    const out = await renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'ua_birth_certificate', sessionRef: 'o1' })
    // baseCanonicalHash must equal the hash of the UNMODIFIED base doc.
    expect(out.certification.baseCanonicalHash).toBe(computeFieldsHash(base))
  })

  it('test 13: all seven certification fields are populated', async () => {
    state.base = doc([field('first_name', 'IVAN')])
    state.resolved = state.base
    state.overrides = []
    const out = await renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'ua_birth_certificate', sessionRef: 'o1' })
    const c = out.certification
    expect(c.canonicalDocumentId).toBe('c1')
    expect(c.baseCanonicalHash).toMatch(/^[0-9a-f]{64}$/)
    expect(c.resolvedCanonicalHash).toMatch(/^[0-9a-f]{64}$/)
    expect(c.overrideSetHash).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof c.overrideVersion).toBe('number')
    expect(c.canonicalSchemaVersion).toBeTruthy()
    expect(c.rendererVersion).toBeTruthy()
  })

  it('test 14: artifactSha256 equals SHA-256 of the returned bytes', async () => {
    state.base = doc([field('first_name', 'IVAN')])
    state.resolved = state.base
    state.overrides = []
    const out = await renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'ua_birth_certificate', sessionRef: 'o1' })
    expect(out.artifactSha256).toBe(createHash('sha256').update(out.pdfBytes).digest('hex'))
    expect(out.byteSize).toBe(out.pdfBytes.byteLength)
  })

  it('test 17: C3-null field (no confirmed override) is NOT rendered (INV-11)', async () => {
    state.base = doc([field('first_name', 'IVAN'), field('middle_name', null)])
    state.resolved = state.base // null stays null (no override)
    state.overrides = []
    const out = await renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'ua_birth_certificate', sessionRef: 'o1' })
    expect(out.renderedKeys).toContain('first_name')
    expect(out.renderedKeys).not.toContain('middle_name')
    expect(out.omittedNullCount).toBe(1)
    expect(capturedFields.find((f) => f.field === 'middle_name')).toBeUndefined()
  })

  it('throws SIGNER_NOT_CONFIGURED when signer env missing', async () => {
    delete process.env.OPERATOR_SIGNER_NAME
    state.base = doc([field('first_name', 'IVAN')])
    state.resolved = state.base
    state.overrides = []
    await expect(renderFromCanonical({ canonicalDocumentId: 'c1', docType: 'x', sessionRef: 'o1' }))
      .rejects.toMatchObject({ code: 'SIGNER_NOT_CONFIGURED' })
    expect(CanonicalRenderError).toBeTruthy()
  })
})
