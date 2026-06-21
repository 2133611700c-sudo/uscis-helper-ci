/**
 * translationOperatorCorrectionE2E.test.ts — OPERATOR-CORRECTION end-to-end (owner priority #5/#6).
 *
 * Proves the WHOLE operator-correction journey for a critical field, with the REAL
 * canonical/brain/PDF code at every hop — NO mocks, NO network, NO live Gemini. The
 * ONLY fabricated input is a synthetic, PII-free OCR read (a handwritten birth-cert dob).
 *
 * The scenario:
 *   1. C3 SAFETY GATE PARKS THE DOB. The real `applyOcrFieldSafety` (ADR-017 C3
 *      contract, ocrFieldSafetyGate.protectOcrField) runs on a handwritten-class,
 *      low-confidence dob. A critical field that cannot be trusted is NEVER guessed:
 *      its value is moved to `candidate_value`, `value=null`, and the C3 ONLY-writer
 *      sets `finalValue=null`. That is the starting state: nothing released.
 *
 *   2. HUMAN OPERATOR CORRECTS IT. The operator reads the real certificate and enters
 *      the correct date. We DO NOT hand-type the formatted string — we call the REAL
 *      value-normalization path (`normalizeCanonicalValue`) which converts ISO
 *      '1989-04-12' → USCIS '04/12/1989', and the REAL server-side C3 re-entry guard
 *      (`validateConfirmedValue`) accepts the clean Latin date. The corrected row is
 *      then modelled exactly as the operator-review wizard ships it: final value set,
 *      review_required=false.
 *
 *   3. THE CORRECTION IS THE RELEASED VALUE. The corrected canonical row exposes the
 *      English USCIS date as its final/released value.
 *
 *   4. REGENERATED CERTIFIED PDF CARRIES THE CORRECTION, ZERO CYRILLIC LEAK. The REAL
 *      `generateTranslationPDF` renders the corrected rows. With poppler (self-skip if
 *      pdfinfo/pdftotext absent) we read the PDF back and assert: the corrected English
 *      date '04/12/1989' is present, the 8 CFR §103.2(b)(3) cert block + named signer
 *      are present, and there is ZERO U+0400–U+04FF Cyrillic leak.
 *
 * NOTE on the operator mutator: there is no dedicated AI "certifier override" mutator
 * in the active flow — `documentSafety/certifierOverrideApply.applyCertifierOverrides`
 * is an intentional no-op stub (the AI-certification path was superseded by the
 * operator-review flow, where the operator edits fields in the admin UI before the PDF
 * is sent). So the correction is modelled at the row level EXACTLY as that wizard does:
 * run the value through the real normalizer + the real confirmed-value guard, then set
 * final_value / review_required on the row that feeds the real PDF generator. The
 * value-normalization and the release-gate are REAL; only the row-assembly (which the
 * UI does) is reproduced here.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { applyOcrFieldSafety } from '@/lib/documentSafety/applyOcrFieldSafety'
import { validateConfirmedValue } from '@/lib/documentSafety/confirmedValueGuard'
import { normalizeCanonicalValue } from '@/lib/canonical/core/knowledgeNormalize'
import { generateTranslationPDF, planTranslationRows } from '@/lib/packet/pdf'

// ── poppler availability (mirror the skipIf pattern used by the other PDF tests) ──
function hasPoppler(): boolean {
  try {
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' })
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const POPPLER = hasPoppler()

const CYRILLIC_RANGE = /[Ѐ-ӿ]/

// What a reader produces on a handwritten birth certificate dob: a value exists but the
// document is a known hard-case class and confidence is below the C3 floor (0.70). The
// dob/date_of_birth field is critical_identity per the CRITICAL_FIELDS_CONTRACT. Synthetic
// value only — this is NOT a real person's date. raw_cyrillic carries the handwritten read.
function makeReaderDobField() {
  return {
    field: 'date_of_birth',
    value: '12-04-1989',            // a low-confidence, ambiguous reader guess (DD-MM? MM-DD?)
    raw_cyrillic: '12 квітня 1989', // the handwritten Ukrainian source the operator will read
    confidence: 0.55,               // below the 0.70 C3 confidence floor
    review_required: true,
  }
}

// Run the REAL C3 safety gate exactly as a reader path would (handwritten birth-cert class).
function runRealC3(fields: ReturnType<typeof makeReaderDobField>[]) {
  return applyOcrFieldSafety(fields, {
    flow: 'translation_public',
    document_class: 'birth_certificate_handwritten', // a HARD_CASE class in the real gate
    source_doc_type: 'birth_certificate',
    expected_source_doc_type: 'birth_certificate',
    strong_source_anchor: false, // a handwritten cert has no MRZ/controlling-Latin anchor
  })
}

describe('translation — operator correction E2E (owner priority #5/#6)', () => {
  // ── STEP 1: starting state — C3 parks the critical dob (never guessed) ──────────
  it('1) C3 safety gate PARKS the handwritten dob: finalValue === null (nothing released)', () => {
    const { fields, anyUnresolvedCritical } = runRealC3([makeReaderDobField()])
    const dob = fields.find((f) => f.field === 'date_of_birth')!
    expect(dob).toBeDefined()
    // C3 ONLY-writer set the release value to null — the value was NOT trusted as final.
    expect(dob.finalValue).toBeNull()
    // value slot emptied; the unsafe read preserved separately as candidate (never lost, never released).
    expect(dob.value).toBeNull()
    expect(dob.candidate_value).toBe('12-04-1989')
    // the field demands human action and is an unresolved critical (blocks PDF/payment).
    expect(dob.review_required).toBe(true)
    expect(dob.manual_required).toBe(true)
    expect(anyUnresolvedCritical).toBe(true)
  })

  // ── STEP 2: operator correction via the REAL normalizer + REAL release-gate ─────
  it('2) operator enters the correct date; REAL normalizer → USCIS MM/DD/YYYY; REAL C3 guard accepts', () => {
    // The operator reads their certificate and enters ISO '1989-04-12'. We DO NOT
    // hand-type '04/12/1989' — the real value-normalization path produces it.
    const decision = normalizeCanonicalValue('date_of_birth', '1989-04-12')
    expect(decision.action).toBe('accept')
    expect(decision.finalValue).toBe('04/12/1989') // USCIS MM/DD/YYYY, produced by the real formatter

    // Server-side C3 re-entry for the confirmed value (ADR-017): clean Latin date accepted.
    const verdict = validateConfirmedValue('date_of_birth', decision.finalValue!)
    expect(verdict.ok).toBe(true)

    // And the guard would REJECT a correction that still leaked Cyrillic on this critical field.
    const cyr = validateConfirmedValue('date_of_birth', decision.finalValue! + ' квітня')
    expect(cyr.ok).toBe(false)
    expect(cyr.reason).toBe('cyrillic_in_release_value')
  })

  // ── STEP 3: the corrected canonical row now exposes the released English value ──
  it('3) corrected canonical row exposes the released English value 04/12/1989', () => {
    const decision = normalizeCanonicalValue('date_of_birth', '1989-04-12')
    // The operator-review wizard ships the corrected row: final value set, review cleared.
    const correctedRow = {
      field: 'date_of_birth',
      final_value: decision.finalValue,  // '04/12/1989'
      review_required: false,
    }
    // The REAL row planner (which the PDF generator uses) prefers final_value when C3 has run,
    // and surfaces it as an 'ok' (released, non-review) row — proof the correction is the release value.
    const plan = planTranslationRows([correctedRow])
    const row = plan.rows.find((r) => r.label === 'Date Of Birth')!
    expect(row.value).toBe('04/12/1989')
    expect(row.status).toBe('ok')        // released, not 'review', not 'missing'
    expect(plan.certifiable).toBe(true)  // no missing fields remain
  })

  // ── STEP 4: regenerated certified PDF carries the correction, zero Cyrillic leak ─
  describe('4) regenerated certified PDF (poppler readback)', () => {
    let buf: Buffer
    let text = ''

    beforeAll(async () => {
      const decision = normalizeCanonicalValue('date_of_birth', '1989-04-12')
      const correctedRow = {
        field: 'date_of_birth',
        final_value: decision.finalValue,
        review_required: false,
      }
      const input = {
        scopeTitle: 'Birth Certificate',
        documentType: 'birth',
        fields: [correctedRow],
        sourceTraces: [],
        certificationRecord: {
          signer_full_name: 'Maria Translator',
          language_pair_confirmed: true,
          statement:
            'I, Maria Translator, certify that I am competent to translate from Ukrainian to English, and that the attached translation is accurate and complete pursuant to 8 CFR 103.2(b)(3).',
          signature_typed_name: 'Maria Translator',
          signed_at: '2026-06-21T00:00:00Z',
          certification_version: 'v1',
        },
        sessionId: 'operator-correction-e2e',
      }
      buf = await generateTranslationPDF(input as any)
      if (POPPLER) {
        text = execFileSync('pdftotext', ['-', '-'], { input: buf }).toString('utf8')
      }
    })

    it('renders a valid, non-trivial certified PDF', () => {
      expect(buf.toString('latin1', 0, 5)).toBe('%PDF-')
      expect(buf.length).toBeGreaterThan(2000)
    })

    it.skipIf(!POPPLER)('the corrected English date 04/12/1989 appears in the PDF text', () => {
      expect(text).toContain('04/12/1989')
    })

    it.skipIf(!POPPLER)('the 8 CFR §103.2(b)(3) cert block + named signer are present', () => {
      expect(text).toContain('TRANSLATOR CERTIFICATION')
      expect(text).toMatch(/8 CFR/)
      expect(text).toMatch(/103\.2\(b\)\(3\)/)
      expect(text).toContain('Maria Translator')
    })

    it.skipIf(!POPPLER)('ZERO Cyrillic (U+0400–U+04FF) leak anywhere in the released PDF', () => {
      expect(CYRILLIC_RANGE.test(text)).toBe(false)
    })
  })
})
