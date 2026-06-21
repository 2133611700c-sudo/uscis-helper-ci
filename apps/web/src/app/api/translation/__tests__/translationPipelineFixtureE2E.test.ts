/**
 * translationPipelineFixtureE2E.test.ts — FIXTURE-E2E (#195)
 *
 * PURPOSE: prove the FULL translation pipeline works end-to-end WITHOUT any
 * external service (no live Gemini), closing the gap that the live E2E is blocked
 * on Gemini quota. We inject a SYNTHETIC, PII-free "OCR read" (an
 * ExtractedDocField[] — the exact shape readDocument emits) for a HANDWRITTEN
 * Ukrainian birth certificate and drive it through the SAME real post-read chain
 * the route runs, in the SAME order:
 *
 *   buildCyrillicMap            (translationAdapter.ts:42)
 *   docintelToCandidate         (translationAdapter.ts:56)   — per page
 *   applyKnowledgeBrainIfEnabled(knowledgeBrain.ts → REAL arbitrateDocument)
 *   buildCanonicalResult        (buildCanonicalResult.ts:24)
 *   toTranslationRows           (translationAdapter.ts:135)
 *   applyOcrFieldSafety         (applyOcrFieldSafety.ts:105) — route runs this
 *                                for flow='translation_public' (C3 critical-null)
 *   generateTranslationPDF      (packet/pdf.ts:135)          — deterministic render
 *   poppler (pdfinfo/pdftoppm/pdftotext) visual acceptance
 *
 * The BRAIN (arbitrateDocument + the C3 safety gate) is REAL — never mocked. The
 * ONLY thing faked is the camera/Gemini read, which is exactly the part blocked on
 * quota. The KMU-55 transliteration is also REAL: the fixture's `value` is produced
 * by the real docintel `toCanonicalValue` (which calls transliterateKMU55), so the
 * test proves the actual transliterator, not hand-typed Latin.
 *
 * The fixture deliberately includes:
 *   - an AMBIGUOUS-SCRIPT name (no distinctive UA/RU letter) → forced review
 *   - a LOW-CONFIDENCE critical field (dob, conf 0.40 < 0.70 floor) → C3 nulls it
 *
 * Poppler is required for the render half; the suite self-skips it where pdfinfo
 * is absent (like translationPdfVisualAcceptance.test.ts) but ALWAYS runs the
 * canonical-rows asserts.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtractedDocField, VisionFieldRead, FieldKind } from '@/lib/docintel/types'
import { toCanonicalValue } from '@/lib/docintel/transliterationPolicy'
import { buildCyrillicMap, docintelToCandidate, toTranslationRows } from '@/lib/canonical/core/translationAdapter'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { buildCanonicalResult } from '@/lib/canonical/core/buildCanonicalResult'
import { docintelIdToDocumentClass } from '@/lib/canonical/core/documentClassPolicy'
import { applyOcrFieldSafety } from '@/lib/documentSafety/applyOcrFieldSafety'
import { generateTranslationPDF } from '@/lib/packet/pdf'

const DOC_TYPE_ID = 'ua_birth_certificate'
const PROVIDER = 'gemini-3.1-pro-preview' // fixture provenance string only — no call is made
const CYRILLIC_RE = /[Ѐ-ӿ]/

/**
 * Build ONE ExtractedDocField exactly as readDocument would: the Latin `value` is
 * produced by the REAL docintel toCanonicalValue (→ transliterateKMU55 for names /
 * normalizeCity for places / ISO passthrough for dates). raw_cyrillic carries the
 * original script. This is the synthetic "OCR read" — PII-free invented Ukrainian.
 */
function makeField(
  field: string,
  kind: FieldKind,
  cyrillic: string,
  opts: { iso_date?: string; confidence?: number; review_required?: boolean; review_reasons?: string[] } = {},
): ExtractedDocField {
  const read: VisionFieldRead = {
    field,
    cyrillic,
    iso_date: opts.iso_date ?? null,
    can_read: true,
    confidence: opts.confidence ?? 0.92,
    reason: 'fixture',
  }
  const value = toCanonicalValue(read, kind)
  return {
    field,
    kind,
    raw_cyrillic: cyrillic || null,
    value,
    confidence: opts.confidence ?? 0.92,
    // Every birth-cert blank is handwritten → reader-level review is always forced.
    review_required: opts.review_required ?? true,
    source: 'vision',
    provider: PROVIDER,
    ...(opts.review_reasons ? { review_reasons: opts.review_reasons } : {}),
  }
}

/**
 * The synthetic handwritten birth-certificate read. PII-free invented values.
 *   - child_family_name "Бондаренко"  — clearly-UA name → KMU-55 "Bondarenko"
 *   - child_given_name  "Олександр"   — clearly-UA name → KMU-55 "Oleksandr"
 *   - child_patronymic  "Петрова"     — AMBIGUOUS script (no і/ї/є/ґ, no ы/э/ё/ъ)
 *                                        → source_script_ambiguous (the ambiguous field)
 *   - dob 0.40 confidence              — LOW-CONFIDENCE CRITICAL (the low-conf critical)
 *   - place_of_birth_city "смт Тростянець" → KMU-55 city "Trostianets"
 *   - issuing_authority / act_record_* — context fields
 */
function buildFixtureRead(): ExtractedDocField[] {
  return [
    makeField('child_family_name', 'name', 'Бондаренко'),
    makeField('child_given_name', 'name', 'Олександр'),
    // Ambiguous: "Петрова" has no UA-distinctive (і/ї/є/ґ) nor RU-distinctive (ы/э/ё/ъ)
    // letter → the source-script gate forces review with source_script_ambiguous.
    makeField('child_patronymic', 'name', 'Петрова', { review_reasons: ['source_script_ambiguous'] }),
    // Low-confidence critical date: conf 0.40 < CONFIDENCE_FLOOR (0.70) → C3 must
    // NULL it (never ship a guessed birth date).
    makeField('dob', 'date', '12.04.1989', { iso_date: '1989-04-12', confidence: 0.4 }),
    makeField('place_of_birth_city', 'place_city', 'смт Тростянець'),
    makeField('issuing_authority', 'agency', 'Відділ ДРАЦС'),
    // act_record_date does NOT match any critical-substring → classifies `optional`
    // → survives C3 as accept_final, giving the rendered PDF a non-Cyrillic value.
    makeField('act_record_date', 'date', '15.04.1989', { iso_date: '1989-04-15', confidence: 0.93 }),
    makeField('act_record_number', 'doc_number', '№ 142'),
  ]
}

/**
 * Drive the REAL post-read chain in the SAME order as vision-extract/route.ts
 * (Core path → toTranslationRows → the route's translation C3 guard
 * applyOcrFieldSafety with flow='translation_public'). Returns the rows the wizard
 * would receive AND the pre-C3 rows (which still carry the KMU-55 Latin for the
 * critical fields that C3 then parks as candidate-only).
 */
function runRealPipeline(fixture: ExtractedDocField[]) {
  // 1. Cyrillic display fallback map (raw script preserved before transliteration).
  const cyrillicMap = buildCyrillicMap(fixture)
  // 2. docintel → Core candidates (page 1).
  const candidates = fixture.map((f) => docintelToCandidate(f, 1))
  // 3. REAL arbitration (D2 Knowledge Brain when enabled — never mocked).
  const canonicalFields = applyKnowledgeBrainIfEnabled(
    candidates,
    buildKnowledgeContext({ docTypeId: DOC_TYPE_ID, product: 'translation' }),
  )
  // 4. Wrap into the ONE canonical envelope.
  const canonicalResult = buildCanonicalResult({
    documentSessionId: 'fixture-e2e',
    product: 'translation',
    docType: DOC_TYPE_ID,
    fields: canonicalFields,
    createdAt: '2026-06-20T00:00:00.000Z',
  })
  // 5. B2 adapter → translation rows (KMU-55 Latin in `value`).
  const preC3Rows = toTranslationRows(canonicalResult.fields, cyrillicMap)
  // 6. The route's translation C3 safety gate (REAL).
  const safety = applyOcrFieldSafety(preC3Rows as never[], {
    flow: 'translation_public',
    document_class: docintelIdToDocumentClass(DOC_TYPE_ID),
  })
  return { cyrillicMap, canonicalResult, preC3Rows, rows: safety.fields, anyUnresolvedCritical: safety.anyUnresolvedCritical }
}

function popplerAvailable(): boolean {
  try { execSync('pdfinfo -v', { stdio: 'pipe' }); return true } catch { return false }
}
const HAS_POPPLER = popplerAvailable()

// Cert block reused verbatim from translationPdfVisualAcceptance.test.ts (proven to
// render the 8 CFR §103.2(b)(3) certification page).
const cert = {
  signer_full_name: 'Ivan Ivanenko',
  address: '1213 Gordon St, Los Angeles, CA 90038',
  language_pair_confirmed: true,
  statement: '',
  signature_typed_name: 'Ivan Ivanenko',
  signed_at: '2026-05-30T00:00:00Z',
  certification_version: 'self_cert_8cfr_v1',
}

describe('FIXTURE-E2E — full translation pipeline (synthetic OCR → real chain → PDF)', () => {
  // ── Canonical-rows asserts (ALWAYS run; no poppler needed) ──────────────────
  describe('canonical translation rows (real arbitrate + C3, no external service)', () => {
    const fixture = buildFixtureRead()
    const { preC3Rows, rows, anyUnresolvedCritical } = runRealPipeline(fixture)
    const byField = (rs: Array<Record<string, unknown>>) => new Map(rs.map((r) => [r.field as string, r]))
    const pre = byField(preC3Rows as never)
    const out = byField(rows as never)

    it('KMU-55 transliteration is correct (real transliterator, clearly-UA names → Latin)', () => {
      // Pre-C3 rows carry the deterministic KMU-55 Latin (C3 then parks the critical
      // ones as candidate-only — proven separately below).
      expect(pre.get('child_family_name')?.value).toBe('Bondarenko')
      expect(pre.get('child_given_name')?.value).toBe('Oleksandr')
      // City: «смт Тростянець» → bare KMU-55 city "Trostianets" with the «смт»
      // designator re-added as the English prefix (hard rule, never "city/town").
      const city = pre.get('place_of_birth_city')?.value as string
      expect(city).toMatch(/Trostianets/)
      expect(city.toLowerCase()).toContain('urban-type settlement')
    })

    it('raw Cyrillic is preserved on every read field (never silently dropped)', () => {
      expect(pre.get('child_family_name')?.raw_cyrillic).toBe('Бондаренко')
      expect(pre.get('child_given_name')?.raw_cyrillic).toBe('Олександр')
      expect(pre.get('dob')?.raw_cyrillic).toBe('12.04.1989')
      // After C3 nulls a critical value, the raw is still recoverable (candidate slot).
      const dob = out.get('dob') as Record<string, unknown>
      expect(dob.candidate_value ?? dob.raw_cyrillic).toBeTruthy()
    })

    it('handwritten cert fields are flagged review (handwriting is never auto-final)', () => {
      // Every birth-cert blank is handwritten → reader forces review → arbiter inherits.
      for (const r of rows as Array<Record<string, unknown>>) {
        expect(r.review_required, `${r.field} must be review_required`).toBe(true)
      }
    })

    it('the AMBIGUOUS-SCRIPT name carries the source_script_ambiguous reason', () => {
      const pat = pre.get('child_patronymic') as Record<string, unknown>
      const reasons = (pat?.review_reasons as string[] | undefined) ?? []
      expect(reasons, `patronymic reasons: ${JSON.stringify(reasons)}`).toContain('source_script_ambiguous')
    })

    it('LOW-CONFIDENCE critical (dob) → value null + finalValue null + review (never guessed)', () => {
      const dob = out.get('dob') as Record<string, unknown>
      expect(dob.value, 'dob value must be nulled by C3').toBeNull()
      expect(dob.finalValue, 'dob finalValue must be explicitly null (C3 rejected)').toBeNull()
      expect(dob.review_required).toBe(true)
      // The raw read is parked as a candidate for human review, never released.
      expect(dob.candidate_value).toBeTruthy()
      expect(anyUnresolvedCritical, 'C3 reports an unresolved critical').toBe(true)
    })

    it('critical identity fields are parked candidate-only on a hard-case cert (no silent-wrong)', () => {
      // birth_certificate_handwritten is a HARD_CASE class → C3 nulls critical
      // identity values (child name/dob/place) — they ship as review, never as a
      // clean PDF value the user did not confirm.
      for (const key of ['child_family_name', 'child_given_name', 'dob', 'place_of_birth_city']) {
        const r = out.get(key) as Record<string, unknown>
        expect(r.value, `${key} value nulled by C3`).toBeNull()
        expect(r.finalValue, `${key} finalValue null`).toBeNull()
      }
      // A NON-identity field (act_record_date) is `optional` → survives as
      // accept_final. The real pipeline normalizes the ISO date to the USCIS US
      // format (MM/DD/YYYY) — proving the date-normalization path actually ran.
      const ard = out.get('act_record_date') as Record<string, unknown>
      expect(ard.finalValue, 'non-critical date survives C3 (US-formatted)').toBe('04/15/1989')
    })
  })

  // ── Poppler visual acceptance (self-skips where pdfinfo absent) ─────────────
  describe('deterministic PDF render + poppler visual acceptance', () => {
    let dir: string
    beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'fixture-e2e-')) })

    it.skipIf(!HAS_POPPLER)('renders pages>=1, non-blank, English present, 8 CFR block, ZERO Cyrillic leak', async () => {
      const fixture = buildFixtureRead()
      const { rows } = runRealPipeline(fixture)
      // Map the REAL post-pipeline rows to the PDF input shape (C3 contract honored:
      // finalValue=null → MISSING placeholder; finalValue=string → released value).
      const pdfFields = (rows as Array<Record<string, unknown>>).map((r) => ({
        field: r.field as string,
        source_label: '', source_zone: 'identity_page',
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        raw_value: '',
        normalized_value: (r.value as string | null) ?? null,
        final_value: r.finalValue as string | null | undefined,
        language_layer: 'latin', confidence: 0.9,
        review_required: r.review_required as boolean, passes: ['t'],
      }))
      const buf = await generateTranslationPDF({
        scopeTitle: 'Birth Certificate', documentType: 'birth',
        fields: pdfFields, sourceTraces: [],
        certificationRecord: cert, sessionId: 'fixture-e2e',
      } as never)
      const pdf = join(dir, 'cert.pdf')
      writeFileSync(pdf, buf)

      // pages >= 1
      const pages = Number(execSync(`pdfinfo "${pdf}"`).toString().match(/Pages:\s+(\d+)/)?.[1] ?? '0')
      expect(pages, 'PDF page count').toBeGreaterThanOrEqual(1)

      // every rendered page non-blank (>3KB png ⇒ not blank/missing)
      execSync(`pdftoppm -png -r 110 "${pdf}" "${join(dir, 'page')}"`)
      const pngs = readdirSync(dir).filter((f) => f.startsWith('page') && f.endsWith('.png'))
      expect(pngs.length, 'rendered pages == page count').toBe(pages)
      for (const p of pngs) expect(statSync(join(dir, p)).size, `${p} non-blank`).toBeGreaterThan(3000)

      // text layer: English translation present + 8 CFR cert block + signer
      const text = execSync(`pdftotext "${pdf}" -`).toString()
      // The surviving non-critical English value (act_record_date, normalized to
      // the USCIS US date format) proves an English translation reached the
      // certified output.
      expect(text, 'English translation value present').toMatch(/04\/15\/1989/)
      expect(text.toLowerCase(), 'translator certification block').toContain('competent to translate')
      expect(text, '8 CFR citation').toMatch(/8 CFR/i)
      expect(text, 'signer name').toContain('Ivan Ivanenko')

      // THE HARD CYRILLIC RULE: zero U+0400–U+04FF in the certified output.
      const leaked = [...text].filter((c) => CYRILLIC_RE.test(c))
      expect(leaked, `no Cyrillic leak (found: ${leaked.slice(0, 8).join('')})`).toHaveLength(0)
    })

    it('reports when poppler is unavailable (so a skip is never mistaken for a pass)', () => {
      if (!HAS_POPPLER) console.warn('[fixture-e2e] poppler absent — install poppler-utils to run the render gate')
      expect(true).toBe(true)
    })
  })
})
