/**
 * visualEvidenceRule.test.ts — owner rule (2026-06-10):
 *   "Label context determines field role. VISUAL EVIDENCE determines field value.
 *    Cross-document/cross-engine match raises CONFIDENCE but does NOT replace
 *    visual evidence." → an illegible date may become a CANDIDATE, never a
 *    finalValue, until the user visually confirms it.
 *
 * Pins that the cross-engine date check raises review + surfaces a candidate, and
 * NEVER overwrites the read value or writes a final value. Synthetic dates only.
 */
import { describe, it, expect } from 'vitest'
import { applyDateEnsemble, type EnsembleField } from '../applyDateEnsemble'
import { applyOcrFieldSafety } from '@/lib/documentSafety/applyOcrFieldSafety'

describe('cross-source date match is a CANDIDATE, never a final value', () => {
  it('a second-engine reading raises review + attaches candidate, never overwrites the value', () => {
    const input: EnsembleField[] = [
      { field: 'dob', kind: 'ai_vision', value: '1990-07-14', raw_cyrillic: '14 июля 1990', review_required: true },
    ]
    const out = applyDateEnsemble(input, '14 июня 1990') // second source disagrees (June vs July)
    const dob = out.fields[0]
    expect(dob.value).toBe('1990-07-14')              // primary value NOT overwritten
    expect(dob.review_required).toBe(true)            // stays review — never finalized by cross-source
    expect(dob.ensemble_candidate).toBe('14 июня 1990') // surfaced as a candidate only
  })

  it('an agreeing second source does NOT lower review or finalize an illegible date', () => {
    const input: EnsembleField[] = [
      { field: 'dob', kind: 'ai_vision', value: '1990-06-14', raw_cyrillic: '14 июня 1990', review_required: true },
    ]
    const out = applyDateEnsemble(input, '14 июня 1990') // agreement
    // agreement raises confidence for the human, but must not clear the review flag here
    expect(out.fields[0].review_required).toBe(true)
  })
})

describe('C3 does not write a finalValue for a review_required (illegible) date', () => {
  it('a review-required date field gets finalValue = null (visual confirmation required)', () => {
    const res = applyOcrFieldSafety(
      [{ field: 'dob', value: '1990-07-14', review_required: true }] as never[],
      { flow: 'translation_public', document_class: 'birth_certificate_handwritten' },
    )
    const dob = (res.fields as Array<{ field: string; finalValue?: string | null }>).find((f) => f.field === 'dob')
    // illegible/unconfirmed → no finalValue (the cross-document DOB cannot finalize it)
    expect(dob?.finalValue ?? null).toBeNull()
  })
})
