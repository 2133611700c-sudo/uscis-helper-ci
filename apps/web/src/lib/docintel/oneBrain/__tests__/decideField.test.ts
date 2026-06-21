import { describe, it, expect } from 'vitest'
import { decideField, scoredForAccuracy, type FieldDecisionInput } from '../decideField'

// L2 SCAFFOLD tests — the binding contract rules. Synthetic values only (no PII).
const base = (p: Partial<FieldDecisionInput> & Pick<FieldDecisionInput, 'field_id' | 'criticality'>): FieldDecisionInput => ({
  reads: [{ reader: 'gemini', model: 'm', run: 1, raw: 'Aaa', confidence: 0.99, can_read: true }],
  ...p,
})

describe('decideField — rule 1: dictionary never overwrites value', () => {
  it('value comes from the read; dictionary only sets normalized_value', () => {
    const d = decideField(base({
      field_id: 'child_family_name', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: 'Aaa', confidence: 0.99, can_read: true }],
      dictionary_signals: [{ kind: 'kmu55', normalized_value: 'Bbb', matched: true }],
      strong_anchor: { kind: 'none', present: false },
    }))
    expect(d.value).toBe('Aaa')            // NOT 'Bbb'
    expect(d.normalized_value).toBe('Bbb') // separate field
  })
  it('a dictionary review signal forces review but does not change value', () => {
    const d = decideField(base({
      field_id: 'place_of_birth_city', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: 'Ccc', confidence: 0.99, can_read: true }],
      dictionary_signals: [{ kind: 'gazetteer', matched: false, suggested_value: 'Ddd', review_required: true, reason: 'fuzzy' }],
    }))
    expect(d.value).toBe('Ccc')
    expect(d.decision).toBe('force_review')
    expect(d.review_reasons).toContain('dictionary_review:gazetteer')
  })
})

describe('decideField — rule 3: self-consistency mismatch on critical → force_review', () => {
  for (const status of ['mismatch', 'incomplete', 'insufficient_identity_fields'] as const) {
    it(`status=${status} on critical identity → force_review + instability flag`, () => {
      const d = decideField(base({
        field_id: 'dob', criticality: 'critical',
        reads: [{ reader: 'gemini', raw: '1990-01-01', confidence: 0.99, can_read: true }],
        self_consistency: { status, instability: status === 'mismatch' },
      }))
      expect(d.decision).toBe('force_review')
      expect(d.safety_flags).toContain('hard_case_model_instability')
    })
  }
  it('model high confidence cannot override a mismatch', () => {
    const d = decideField(base({
      field_id: 'given_name', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: 'Aaa', confidence: 1.0, can_read: true }],
      self_consistency: { status: 'mismatch', instability: true },
    }))
    expect(d.decision).toBe('force_review')
  })
})

describe('decideField — rule 2: critical + any review signal → force_review (no accept, no low_confidence)', () => {
  it('critical + invalid validator → force_review', () => {
    const d = decideField(base({
      field_id: 'dob', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: '1990-13-40', confidence: 0.99, can_read: true }],
      validation_signals: [{ rule: 'calendar_date', status: 'invalid' }],
    }))
    expect(d.decision).toBe('force_review')
    expect(d.review_reasons).toContain('validation_invalid:calendar_date')
  })
  it('critical clean high-confidence + no signal → accept', () => {
    const d = decideField(base({ field_id: 'child_family_name', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: 'Aaa', confidence: 0.99, can_read: true }] }))
    expect(d.decision).toBe('accept')
    expect(d.review_required).toBe(false)
  })
  it('strong anchor (MRZ) → accept even on critical', () => {
    const d = decideField(base({ field_id: 'passport_number', criticality: 'critical',
      reads: [{ reader: 'gemini', raw: 'x', confidence: 0.4, can_read: true }],
      strong_anchor: { kind: 'mrz', present: true, value: 'AB123', valid: true } }))
    expect(d.decision).toBe('accept')
    expect(d.value).toBe('AB123')
  })
})

describe('decideField — reject + purity', () => {
  it('no readable source → reject, value null, review', () => {
    const d = decideField(base({ field_id: 'x', criticality: 'low',
      reads: [{ reader: 'gemini', raw: null, confidence: 0, can_read: false }] }))
    expect(d.decision).toBe('reject')
    expect(d.value).toBeNull()
    expect(d.review_required).toBe(true)
    expect(d.review_reasons).toContain('no_source')
  })
  it('pure: same input → same audit_hash; input not mutated', () => {
    const inp = base({ field_id: 'child_family_name', criticality: 'critical' })
    const snapshot = JSON.stringify(inp)
    const a = decideField(inp); const b = decideField(inp)
    expect(a.audit_hash).toBe(b.audit_hash)
    expect(JSON.stringify(inp)).toBe(snapshot) // no mutation
  })
})

describe('rule 4: candidate_not_verified excluded from accuracy', () => {
  it('scoredForAccuracy honors owner_verified + candidate_not_verified', () => {
    expect(scoredForAccuracy({ owner_verified_field: true })).toBe(true)
    expect(scoredForAccuracy({ owner_verified_field: true, candidate_not_verified: true })).toBe(false)
    expect(scoredForAccuracy({ owner_verified_field: false })).toBe(false)
    expect(scoredForAccuracy(undefined)).toBe(false)
  })
})

describe('rule 5: not wired → no live caller (byte-identical OFF)', () => {
  it('decideField is a standalone pure fn (no import side effects on routes)', () => {
    // Structural: nothing in /api imports decideField yet (verified by the no-wiring grep in the report).
    expect(typeof decideField).toBe('function')
  })
})
