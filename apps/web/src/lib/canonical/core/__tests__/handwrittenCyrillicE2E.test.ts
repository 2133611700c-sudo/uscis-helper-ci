/**
 * handwrittenCyrillicE2E.test.ts — THE handwritten-Cyrillic end-to-end contract.
 *
 * Pins the WHOLE chain a real handwritten birth certificate travels (verified live in
 * prod on a real doc, 2026-06-10) using the REAL functions at every hop — no mocks:
 *
 *   reader output (handwritten ⇒ review_required + specific reasons)
 *     → docintelToCandidate → arbitrateDocument → canonicalToFieldOut   [read + WHY]
 *     → user confirms in D5 (normalized_value) → validateConfirmedValue [human-in-loop]
 *     → release value                                                    [C3 contract]
 *     → renderMirrorTranslationPDF                                       [output]
 *
 * The product promise for handwritten Cyrillic: NAMES are read (review-gated), the
 * DATE may be misread by every engine (proven) — so nothing is ever silently final;
 * the user's confirmation releases values, and the unconfirmed date stays a visible
 * [CONFIRM]/blank in the PDF. Synthetic values only.
 */
import { describe, it, expect } from 'vitest'
import { docintelToCandidate, canonicalToFieldOut } from '../translationAdapter'
import { arbitrateDocument } from '../arbitration'
import { validateConfirmedValue } from '@/lib/documentSafety/confirmedValueGuard'
import { renderMirrorTranslationPDF } from '@/lib/translation/pdf/renderMirrorTranslationPDF'
import type { ExtractedDocField } from '@/lib/docintel/types'

// What the reader produces on a handwritten birth cert (shape verified live in prod):
// names readable (Cyrillic preserved), EVERYTHING review_required, the date misread.
const READER_OUTPUT: ExtractedDocField[] = [
  { field: 'child_family_name', kind: 'name', raw_cyrillic: 'Іваненко', value: 'Ivanenko',
    confidence: 0.9, review_required: true, source: 'vision', provider: 'gemini' },
  { field: 'child_given_name', kind: 'name', raw_cyrillic: 'Иван', value: 'Serhei',
    confidence: 0.85, review_required: true, source: 'vision', provider: 'gemini',
    review_reasons: ['source_script_ambiguous'] }, // no distinctive UA/RU letter
  { field: 'dob', kind: 'date', raw_cyrillic: '28 липня 1986', value: '1986-07-28',
    confidence: 0.6, review_required: true, source: 'vision', provider: 'gemini' }, // MISREAD month+day (the proven failure)
]

describe('handwritten Cyrillic — full chain, real functions', () => {
  it('1) read: every handwritten field reaches the API review-gated, with WHY', () => {
    const fields = arbitrateDocument(READER_OUTPUT.map((f, i) => docintelToCandidate(f, 1)))
    const out = fields.map((f) => canonicalToFieldOut(f))
    // nothing silently final
    for (const f of out) expect(f.review_required).toBe(true)
    // the ambiguous name explains itself to the D5 screen
    const given = out.find((f) => f.field === 'child_given_name')
    expect(given?.review_reasons).toContain('source_script_ambiguous')
    // Cyrillic is preserved end-to-end for the review screen
    expect(out.find((f) => f.field === 'child_family_name')?.raw_cyrillic).toBe('Іваненко')
  })

  it('2) human-in-loop: the user fixes the misread date; the guard accepts a clean value', () => {
    // user looked at their own certificate and typed the real date
    const verdict = validateConfirmedValue('dob', '01/01/1990')
    expect(verdict.ok).toBe(true)
  })

  it('2b) the guard REJECTS a correction that still contains Cyrillic (critical field)', () => {
    const verdict = validateConfirmedValue('child_given_name', 'Іван') // not romanized
    expect(verdict.ok).toBe(false)
  })

  it('3) output: the mirror PDF shows confirmed values and keeps the unconfirmed date visible', async () => {
    const res = await renderMirrorTranslationPDF('ua_birth_certificate', [
      { field: 'child_family_name', value: 'Ivanenko', review_required: false }, // confirmed
      { field: 'child_given_name', value: 'Ivan', review_required: false },    // confirmed (user picked UA form)
      { field: 'dob', value: '1986-07-28', review_required: true },              // NOT confirmed → must be marked
    ])
    expect(res).not.toBeNull()
    // the review-flagged date is surfaced as unresolved ([CONFIRM]), never silently printed as final
    expect(res!.unresolved).toContain('date_of_birth')
    // a confirmed name is NOT in the unresolved list
    expect(res!.unresolved).not.toContain('child_surname')
  })
})
