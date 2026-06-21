/**
 * explicitFallback.test.ts — Phase 1 / Agent 4 (parity + fallback guards).
 *
 * Guard for ONE convention: a fallback (old path used instead of the canonical
 * Core) must ALWAYS be representable as an EXPLICIT boolean — never implied
 * silently by "the value just looks different" or "a field went missing".
 *
 * Where this is tracked today: both product adapters that emit a wrapper carry
 * an explicit `fallback_used: boolean` on their answer object —
 *   - ReParoleCoreAnswers.fallback_used  (reParoleAdapter)
 *   - EadCoreAnswers.fallback_used       (eadAdapter)
 * Both are hard-coded `false` because, by construction, those adapters ARE the
 * Core path (they never fall back internally). The flag exists so the CALLER
 * that chooses Core-vs-old can set it to true when it uses the old path, and a
 * downstream auditor can read a boolean instead of inferring from data shape.
 *
 * This test asserts the SHAPE of that contract (the boolean is present and the
 * Core-produced value is false) and documents the required convention. NO PII:
 * synthetic field key + value only.
 */
import { describe, it, expect } from 'vitest'
import { buildCanonicalResult } from '../buildCanonicalResult'
import { toReParoleCoreAnswers } from '../reParoleAdapter'
import { toEadAnswers } from '../eadAdapter'
import type { CanonicalField } from '../../types'

function synthCanonical() {
  const fields: CanonicalField[] = [
    {
      key: 'family_name',
      rawValue: 'TESTOVYI',
      normalizedValue: 'TESTOVYI',
      finalValue: 'TESTOVYI',
      criticality: 'high',
      confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
      source: 'mrz',
      reviewRequired: false,
      reviewReasons: [],
      evidence: [],
    },
  ]
  return buildCanonicalResult({
    documentSessionId: 'fallback-synth-1',
    product: 'reparole',
    docType: 'ua_international_passport',
    fields,
    createdAt: '2026-06-13T00:00:00.000Z',
  })
}

describe('explicit fallback convention — never implied silently', () => {
  const canonical = synthCanonical()

  it('Re-Parole answer exposes an explicit boolean fallback_used', () => {
    const r = toReParoleCoreAnswers(canonical)
    expect(r).toHaveProperty('fallback_used')
    expect(typeof r.fallback_used).toBe('boolean')
    // The Core path is NOT a fallback → false.
    expect(r.fallback_used).toBe(false)
  })

  it('EAD answer exposes an explicit boolean fallback_used', () => {
    const r = toEadAnswers(canonical)
    expect(r).toHaveProperty('fallback_used')
    expect(typeof r.fallback_used).toBe('boolean')
    expect(r.fallback_used).toBe(false)
  })

  it('CONTRACT: a fallback must be an explicit boolean, never inferred from data shape', () => {
    // This codifies the convention for any future consumer/provider:
    //   - represent "old path was used" as an explicit boolean field (fallback_used),
    //   - default it to false (Core path), set true ONLY when the old path ran,
    //   - downstream auditors read THIS boolean — never guess from missing fields
    //     or a differently-shaped value.
    const r = toReParoleCoreAnswers(canonical)
    const e = toEadAnswers(canonical)
    // Both adapters speak the same explicit vocabulary.
    expect(Object.prototype.hasOwnProperty.call(r, 'fallback_used')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(e, 'fallback_used')).toBe(true)
    // And both also carry an explicit machine-readable status (not a silent guess).
    expect(['ok', 'partial', 'failed']).toContain(r.core_status)
    expect(['ok', 'partial', 'failed']).toContain(e.core_status)
  })
})
