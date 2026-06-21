/**
 * reviewReasonsChain.test.ts — the review-REASON pipeline for handwritten Cyrillic.
 *
 * Found by a LIVE prod test on a real handwritten birth cert (2026-06-10): the reader
 * sets specific review_reasons (source_script_ambiguous, date_role_conflict,
 * fallback_model_used) but the translation response showed review_reasons=[] —
 * because (1) docintelToCandidate REPLACED them with a generic ['reader_flagged'] and
 * (2) canonicalToFieldOut never output them at all. The D5 review screen therefore
 * cannot tell the user WHY a handwritten field needs review.
 *
 * This pins the full chain: ExtractedDocField.review_reasons → FieldCandidate
 * .reviewReasons → (arbitration merges) → CanonicalField.reviewReasons → FieldOut
 * .review_reasons. Synthetic values only.
 */
import { describe, it, expect } from 'vitest'
import { docintelToCandidate, canonicalToFieldOut } from '../translationAdapter'
import { arbitrateDocument } from '../arbitration'
import type { ExtractedDocField } from '@/lib/docintel/types'

const readerField = (over: Partial<ExtractedDocField> = {}): ExtractedDocField => ({
  field: 'given_name',
  kind: 'name',
  raw_cyrillic: 'Иван', // ambiguous script (no distinctive UA/RU letter) — synthetic
  value: 'Serhei',
  confidence: 0.9,
  review_required: true,
  source: 'vision',
  provider: 'gemini',
  review_reasons: ['source_script_ambiguous'],
  ...over,
})

describe('review reasons survive the candidate boundary', () => {
  it('docintelToCandidate carries the SPECIFIC reasons (not a generic replacement)', () => {
    const c = docintelToCandidate(readerField(), 1)
    expect(c.reviewReasons).toContain('source_script_ambiguous')
  })

  it('falls back to reader_flagged only when the reader gave no specific reason', () => {
    const c = docintelToCandidate(readerField({ review_reasons: undefined }), 1)
    expect(c.reviewReasons).toEqual(['reader_flagged'])
  })
})

describe('review reasons survive arbitration → FieldOut (the live-prod gap)', () => {
  it('source_script_ambiguous reaches the API field shape end-to-end', () => {
    const candidate = docintelToCandidate(readerField(), 1)
    const fields = arbitrateDocument([candidate])
    const canonical = fields.find((f) => f.key === 'given_name')
    expect(canonical?.reviewReasons).toContain('source_script_ambiguous')

    const out = canonicalToFieldOut(canonical!)
    expect(out.review_required).toBe(true)
    expect(out.review_reasons).toContain('source_script_ambiguous') // was [] in prod
  })

  it('a non-review field outputs no review_reasons noise', () => {
    const clean = readerField({ review_required: false, review_reasons: undefined, raw_cyrillic: 'Іван', value: 'Ivan' })
    const candidate = docintelToCandidate(clean, 1)
    const fields = arbitrateDocument([candidate])
    const out = canonicalToFieldOut(fields.find((f) => f.key === 'given_name')!)
    expect(out.review_reasons ?? []).not.toContain('source_script_ambiguous')
  })
})
