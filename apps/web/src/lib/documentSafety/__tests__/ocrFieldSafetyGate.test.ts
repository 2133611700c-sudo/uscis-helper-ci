import { describe, it, expect } from 'vitest'
import {
  protectOcrField,
  hasUnresolvedCriticalForOutput,
  OCR_SAFETY_POLICY_VERSION,
  type OcrFieldSafetyInput,
} from '../ocrFieldSafetyGate'

// Base = a critical identity field that IS safe (strong anchor, source matches, good conf, recognized).
function safeCritical(over: Partial<OcrFieldSafetyInput> = {}): OcrFieldSafetyInput {
  return {
    flow: 'tps_core',
    field_name: 'patronymic',
    criticality: 'critical_identity',
    document_class: 'ua_internal_passport_booklet',
    source_doc_type: 'ua_internal_passport_booklet',
    expected_source_doc_type: 'ua_internal_passport_booklet',
    value_present: true,
    confidence: 0.95,
    strong_source_anchor: true,
    ...over,
  }
}

describe('protectOcrField — contract enforcement (pure, no value, no PII)', () => {
  it('safe critical field → accept_final', () => {
    const r = protectOcrField(safeCritical())
    expect(r.decision).toBe('accept_final')
    expect(r.final_value_allowed).toBe(true)
    expect(r.blocked_for_pdf).toBe(false)
    expect(r.review_required).toBe(false)
    expect(r.policy_version).toBe(OCR_SAFETY_POLICY_VERSION)
  })

  it('R1 zero recognition + critical → block, manual, blocked for pdf/payment', () => {
    const r = protectOcrField(safeCritical({ zero_usable_recognition: true, value_present: false }))
    expect(r.decision).toBe('block')
    expect(r.final_value_allowed).toBe(false)
    expect(r.manual_required).toBe(true)
    expect(r.blocked_for_pdf).toBe(true)
    expect(r.blocked_for_payment).toBe(true)
    expect(r.reason_codes).toContain('zero_usable_recognition')
  })

  it('R2 source_doc_type mismatch + critical → not final (block/manual)', () => {
    const r = protectOcrField(safeCritical({ source_doc_type: 'ua_birth_certificate', expected_source_doc_type: 'ua_internal_passport_booklet' }))
    expect(r.final_value_allowed).toBe(false)
    expect(['block', 'manual_required']).toContain(r.decision)
    expect(r.reason_codes).toContain('source_doc_type_mismatch')
  })

  it('R3 hard-case birth cert + critical identity → candidate_only/manual, never final', () => {
    const r = protectOcrField(safeCritical({ document_class: 'birth_certificate_handwritten', strong_source_anchor: true }))
    expect(r.final_value_allowed).toBe(false)
    expect(['candidate_only', 'manual_required']).toContain(r.decision)
    expect(r.reason_codes).toContain('hard_case_manual_required')
  })

  it('R4 legacy reader + critical (no strong anchor) → candidate_only/manual', () => {
    const r = protectOcrField(safeCritical({ legacy_reader: true, strong_source_anchor: false }))
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('legacy_reader_untrusted')
  })

  it('R5 no strong source anchor + critical → candidate_only/manual', () => {
    const r = protectOcrField(safeCritical({ strong_source_anchor: false }))
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('no_strong_source_anchor')
  })

  it('low confidence + critical → not final', () => {
    const r = protectOcrField(safeCritical({ confidence: 0.4 }))
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('low_confidence')
  })

  it('R6 admin field with safe source → accept_final', () => {
    const r = protectOcrField({ flow: 'tps_core', field_name: 'us_address_state', criticality: 'admin', value_present: true })
    expect(r.decision).toBe('accept_final')
    expect(r.final_value_allowed).toBe(true)
  })

  it('admin field with source mismatch → manual_required (review even admin if source wrong)', () => {
    const r = protectOcrField({ flow: 'tps_legacy', field_name: 'us_address_state', criticality: 'admin', value_present: true, source_doc_type: 'a', expected_source_doc_type: 'b' })
    expect(r.decision).toBe('manual_required')
  })

  it('R7 review_required / manual_required can only INCREASE, never decrease', () => {
    // incoming flags true, but field would otherwise be accept_final → must stay flagged
    const r = protectOcrField(safeCritical({ review_required: true, manual_required: true }))
    expect(r.review_required).toBe(true)
    expect(r.manual_required).toBe(true)
  })

  it('R8 guard never receives or emits a value — output has no value fields, no_pii=true', () => {
    const r = protectOcrField(safeCritical({ document_class: 'birth_certificate_handwritten' }))
    expect(r.no_pii).toBe(true)
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/[Ѐ-ӿ]/)        // no Cyrillic
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/) // no dates
    expect(r).not.toHaveProperty('value')
    expect(r).not.toHaveProperty('final_value')
  })

  it('stale session (source_doc_id != session_doc_id) + critical → blocked', () => {
    const r = protectOcrField(safeCritical({ source_doc_id_hash: 'aaa', session_doc_id_hash: 'bbb' }))
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('stale_or_ambiguous_session')
  })

  it('candidate is preserved separately when value/candidate present but not final', () => {
    const r = protectOcrField(safeCritical({ document_class: 'birth_certificate_handwritten', candidate_value_present: true }))
    expect(r.decision).toBe('candidate_only')
    expect(r.candidate_allowed).toBe(true)
    expect(r.final_value_allowed).toBe(false)
  })
})

describe('hasUnresolvedCriticalForOutput — shared PDF/payment gate (rule 10)', () => {
  it('blocks when a critical field is review_required and not confirmed', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'critical_identity', review_required: true },
    ])).toBe(true)
  })
  it('blocks when a critical field is manual_required and not confirmed', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'critical_identity', manual_required: true, confirmed: false },
    ])).toBe(true)
  })
  it('allows when the critical field is confirmed', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'critical_identity', review_required: true, confirmed: true },
    ])).toBe(false)
  })
  it('admin/optional unresolved does NOT block output', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'admin', review_required: true },
      { criticality: 'optional', manual_required: true },
    ])).toBe(false)
  })
  it('all clean → no block', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'critical_identity', review_required: false },
    ])).toBe(false)
  })
})
