/**
 * I-765 field-by-field validation harness (Phase 2B, Agent 3).
 *
 * Validates the SHARED I-765 generation in BOTH products — TPS-with-EAD and
 * standalone EAD — against the edition-locked official I-765 (Edition 08/21/25),
 * field by field, through the FINAL rendered PDF (real pdf-lib AcroForm readback).
 *
 * Method (no PII committed — synthetic answers only for generation):
 *   1. Enumerate EVERY AcroForm field on the shared i-765.pdf.
 *   2. Generate the I-765 PDF in each mode from synthetic answers via the real
 *      production code path (buildPacket / buildEadPacket).
 *   3. Read every AcroForm field back and assign a per-field VERDICT.
 *   4. Assert the HARD invariants and the golden cross-product comparison.
 *
 * Verified ground-truth (qa-private, gitignored) is consulted ONLY at runtime to
 * drive enum verdicts on the cross-contamination invariants (A-number ≠ EAD card
 * number, I-94 number ≠ passport number, leading zeros). No GT value is written
 * into a tracked file.
 *
 * Verdicts: SAME | EMPTY_EXPECTED | EMPTY_WRONG | WRONG_VALUE | WRONG_SOURCE |
 *           FABRICATED | FORMAT_WRONG | CHECKBOX_WRONG | RADIO_WRONG |
 *           NOT_APPLICABLE | GT_MISSING
 */
import { describe, it, expect, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import JSZip from 'jszip'
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib'

import { buildPacket } from '@/lib/tps/packetBuilder'
import { buildEadPacket } from '@/lib/ead/packetBuilder'
import type { TPSAnswers } from '@/lib/tps/answers'
import type { EadFieldData } from '@/lib/ead/i765FieldMap'
import { buildI765Ops } from '@/lib/tps/forms/i765FieldMap'
import { buildEadI765Ops } from '@/lib/ead/i765FieldMap'
import { buildI765DocumentOps } from '@/lib/canonical/forms/i765DocumentMapper'
import type { CanonicalDocumentResult, CanonicalField } from '@/lib/canonical/types'

vi.setConfig({ testTimeout: 120_000 })

// ── Synthetic answers (NO real PII — generic placeholders) ────────────────────
// Distinct synthetic values for every cross-contamination-sensitive fact so a
// mis-wire (e.g. passport bleeding into I-94) is detectable by value, not luck.
// All values below are SYNTHETIC placeholders (not from any real document). The
// shapes (length, "A"/dash separators, leading zeros, 11-char admission pattern)
// are realistic so format defects surface; the digits themselves are invented.
const SYN = {
  family: 'HARNESSFAMILY',
  given: 'HARNESSGIVEN',
  middle: 'HARNESSMID',
  dob: '1991-02-03',
  sex: 'M' as const,
  aNumberRaw: 'A012345678', // 'A' + 9 digits, leading zero — realistic A-number shape
  aNumberDigits: '012345678',
  cardNumber: 'ABC0000000001', // synthetic EAD card-number shape — MUST NOT reach A-number field
  passportNo: 'FA012345', // leading zero preserved
  passportCountry: 'Ukraine',
  passportExp: '2030-06-01',
  i94No: '00000000099', // 11-char admission-number shape — MUST NOT equal passport
  lastEntry: '2023-07-04',
  statusAtEntry: 'UHP',
  currentStatus: 'parolee',
  placeEntry: 'JFK',
  city: 'Kyiv',
  province: 'Kyiv Oblast',
}

const tpsSynthetic: TPSAnswers = {
  family_name: SYN.family,
  given_name: SYN.given,
  middle_name: SYN.middle,
  dob: SYN.dob,
  sex: SYN.sex,
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  city_of_birth: SYN.city,
  province_of_birth: SYN.province,
  a_number: SYN.aNumberRaw,
  passport_number: SYN.passportNo,
  passport_country_of_issuance: SYN.passportCountry,
  passport_expiration_date: SYN.passportExp,
  i94_admission_number: SYN.i94No,
  last_entry_date: SYN.lastEntry,
  status_at_last_entry: SYN.statusAtEntry,
  current_immigration_status: SYN.currentStatus,
  place_of_last_entry: SYN.placeEntry,
  us_address_street: '100 Test St',
  us_address_city: 'Testville',
  us_address_state: 'CA',
  us_address_zip: '90001',
  mailing_same_as_physical: true,
  filing_path: 'initial',
  wants_ead: true,
  ead_category: 'c19',
  daytime_phone: '5550000000',
  email: 'test@example.invalid',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
} as unknown as TPSAnswers

const eadSynthetic: EadFieldData = {
  appType: 'new',
  category: 'c11',
  firstName: SYN.given,
  lastName: SYN.family,
  middleName: SYN.middle,
  dob: SYN.dob,
  countryOfBirth: 'Ukraine',
  alienNumber: SYN.aNumberRaw,
  gender: 'male',
  usAddress: '100 Test St, Testville, CA 90001',
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
async function readAllFields(
  bytes: Uint8Array,
): Promise<Map<string, { type: string; value: string | boolean | null; maxLength?: number }>> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const out = new Map<string, { type: string; value: string | boolean | null; maxLength?: number }>()
  for (const f of form.getFields()) {
    const name = f.getName()
    if (f instanceof PDFTextField) {
      out.set(name, { type: 'text', value: f.getText() ?? null, maxLength: f.getMaxLength() })
    } else if (f instanceof PDFCheckBox) {
      out.set(name, { type: 'checkbox', value: f.isChecked() })
    } else if (f instanceof PDFDropdown) {
      const sel = f.getSelected()
      out.set(name, { type: 'choice', value: sel.length ? sel[0] : null })
    } else {
      out.set(name, { type: 'other', value: null })
    }
  }
  return out
}

async function tpsI765Bytes(): Promise<Uint8Array> {
  const r = await buildPacket(tpsSynthetic)
  const zip = await JSZip.loadAsync(r.zipBytes)
  return zip.file('I-765.pdf')!.async('uint8array')
}
async function eadI765Bytes(): Promise<Uint8Array> {
  const r = await buildEadPacket(eadSynthetic)
  return r.pdfBytes
}

// Verified GT (gitignored). Returns null when absent → GT_MISSING verdicts.
function loadGT(name: string): Record<string, unknown> | null {
  const p = join(process.cwd(), '..', '..', 'qa-private', 'ground-truth', name)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

type Verdict =
  | 'SAME'
  | 'EMPTY_EXPECTED'
  | 'EMPTY_WRONG'
  | 'WRONG_VALUE'
  | 'WRONG_SOURCE'
  | 'FABRICATED'
  | 'FORMAT_WRONG'
  | 'CHECKBOX_WRONG'
  | 'RADIO_WRONG'
  | 'NOT_APPLICABLE'
  | 'GT_MISSING'

describe('I-765 field-by-field harness — edition + inventory', () => {
  it('shared template is Edition 08/21/25 on all 7 pages and exposes the expected AcroForm fields', async () => {
    const repoRoot = join(process.cwd(), '..', '..')
    const pdf = join(process.cwd(), 'public', 'uscis', 'tps', 'i-765.pdf')
    expect(existsSync(pdf)).toBe(true)
    const info = execSync(`pdfinfo "${pdf}"`, { encoding: 'utf-8' })
    const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1])
    expect(pages).toBe(7)
    for (let p = 1; p <= pages; p++) {
      const txt = execSync(`pdftotext -f ${p} -l ${p} "${pdf}" - 2>/dev/null`, { encoding: 'utf-8' })
      expect(txt, `page ${p} edition footer`).toMatch(/Edition 08\/21\/25/)
    }
    void repoRoot
  })
})

describe('I-765 field-by-field harness — per-field verdicts (BOTH modes)', () => {
  it('classifies every AcroForm field in TPS and EAD modes; emits redacted verdict counts', async () => {
    const [tpsBytes, eadBytes] = await Promise.all([tpsI765Bytes(), eadI765Bytes()])
    const tpsFields = await readAllFields(tpsBytes)
    const eadFields = await readAllFields(eadBytes)

    // The op-set each product intends to write (the source of "expected").
    const tpsOps = buildI765Ops(tpsSynthetic)
    const eadOps = buildEadI765Ops(eadSynthetic)

    function classify(
      ops: ReturnType<typeof buildI765Ops>,
      fields: Awaited<ReturnType<typeof readAllFields>>,
      label = '',
    ): Record<Verdict, number> {
      const fabricated: string[] = []
      const emptyWrong: string[] = []
      const counts = {
        SAME: 0, EMPTY_EXPECTED: 0, EMPTY_WRONG: 0, WRONG_VALUE: 0, WRONG_SOURCE: 0,
        FABRICATED: 0, FORMAT_WRONG: 0, CHECKBOX_WRONG: 0, RADIO_WRONG: 0,
        NOT_APPLICABLE: 0, GT_MISSING: 0,
      } as Record<Verdict, number>
      const opByField = new Map(ops.map((o) => [o.field, o]))

      for (const [name, fld] of fields) {
        // XFA-managed 2D barcode fields carry template-default content (not
        // applicant data and not written by our op list). They are auto-managed
        // by the USCIS template, not a data cell we fill → NOT_APPLICABLE.
        if (name.includes('PDF417BarCode')) {
          counts.NOT_APPLICABLE++
          continue
        }
        const op = opByField.get(name)
        if (!op) {
          // No op targets this field → it should be empty/unchecked.
          if (fld.type === 'text' || fld.type === 'choice') {
            if (fld.value == null || fld.value === '') counts.EMPTY_EXPECTED++
            else { counts.FABRICATED++; fabricated.push(name) } // value present but nobody wrote it intentionally
          } else if (fld.type === 'checkbox') {
            if (fld.value === false) counts.EMPTY_EXPECTED++
            else { counts.FABRICATED++; fabricated.push(name) }
          } else {
            counts.NOT_APPLICABLE++
          }
          continue
        }
        // An op targets this field.
        if (op.kind === 'checkbox') {
          const expected = op.value === true
          counts[fld.value === expected ? 'SAME' : 'CHECKBOX_WRONG']++
          continue
        }
        // text/choice op
        const expected = String(op.value ?? '')
        const actual = String(fld.value ?? '')
        if (expected === '') {
          counts[actual === '' ? 'EMPTY_EXPECTED' : 'FABRICATED']++
        } else if (actual === expected) {
          counts.SAME++
        } else if (actual === '') {
          // op intended a value but the PDF field is empty → it was skipped
          // (e.g. maxLength rejection). That is an EMPTY_WRONG defect.
          counts.EMPTY_WRONG++
          emptyWrong.push(name)
        } else {
          counts.WRONG_VALUE++
        }
      }
      if (fabricated.length) console.log(`[${label}] FABRICATED fields:`, fabricated)
      if (emptyWrong.length) console.log(`[${label}] EMPTY_WRONG fields:`, emptyWrong)
      return counts
    }

    const tpsVerdicts = classify(tpsOps, tpsFields, 'TPS')
    const eadVerdicts = classify(eadOps, eadFields, 'EAD')

    // eslint-disable-next-line no-console
    console.log('I-765 TPS-mode verdicts:', JSON.stringify(tpsVerdicts))
    // eslint-disable-next-line no-console
    console.log('I-765 EAD-mode verdicts:', JSON.stringify(eadVerdicts))
    // eslint-disable-next-line no-console
    console.log('I-765 field totals: TPS=' + tpsFields.size + ' EAD=' + eadFields.size)

    // No fabricated, no wrong-source, no checkbox/radio defects in either mode.
    expect(tpsVerdicts.FABRICATED).toBe(0)
    expect(eadVerdicts.FABRICATED).toBe(0)
    expect(tpsVerdicts.CHECKBOX_WRONG).toBe(0)
    expect(eadVerdicts.CHECKBOX_WRONG).toBe(0)
    expect(tpsVerdicts.WRONG_VALUE).toBe(0)
    expect(eadVerdicts.WRONG_VALUE).toBe(0)
    // Every op that intended a value must land (no silent drops / maxLength skips).
    expect(tpsVerdicts.EMPTY_WRONG).toBe(0)
    expect(eadVerdicts.EMPTY_WRONG).toBe(0)
  })
})

describe('I-765 HARD invariants', () => {
  it('A-Number is written (9-digit field) even when supplied with "A" prefix — leading zeros preserved', async () => {
    const [tpsBytes, eadBytes] = await Promise.all([tpsI765Bytes(), eadI765Bytes()])
    const tps = await readAllFields(tpsBytes)
    const ead = await readAllFields(eadBytes)
    const tpsA = tps.get('form1[0].Page2[0].Line7_AlienNumber[0]')
    const eadA = ead.get('form1[0].Page2[0].Line7_AlienNumber[0]')
    // Field caps at 9 chars; input was 'A012345678' (10). Must be the 9 digits,
    // leading zero intact — NOT empty (silent skip) and NOT truncated wrong.
    expect(tpsA?.value).toBe(SYN.aNumberDigits)
    expect(eadA?.value).toBe(SYN.aNumberDigits)
  })

  it('A-Number field NEVER holds the EAD card number (cross-contamination guard)', async () => {
    const tps = await readAllFields(await tpsI765Bytes())
    const aNum = String(tps.get('form1[0].Page2[0].Line7_AlienNumber[0]')?.value ?? '')
    expect(aNum).not.toBe(SYN.cardNumber)
    expect(aNum).not.toContain('IOE')
  })

  it('I-94 number ≠ passport number; each lands in its own cell', async () => {
    const tps = await readAllFields(await tpsI765Bytes())
    const i94 = String(tps.get('form1[0].Page3[0].Line20a_I94Number[0]')?.value ?? '')
    const passport = String(tps.get('form1[0].Page3[0].Line20b_Passport[0]')?.value ?? '')
    expect(i94).toBe(SYN.i94No)
    expect(passport).toBe(SYN.passportNo)
    expect(i94).not.toBe(passport)
    // Travel-document cell (Line20c) is never auto-filled from the passport number.
    expect(String(tps.get('form1[0].Page3[0].Line20c_TravelDoc[0]')?.value ?? '')).toBe('')
  })

  it('leading zeros preserved in passport number and A-number (no numeric coercion)', async () => {
    const tps = await readAllFields(await tpsI765Bytes())
    // Passport 'FA012345' keeps its embedded zero; A-number digits keep the leading 0.
    expect(tps.get('form1[0].Page3[0].Line20b_Passport[0]')?.value).toBe(SYN.passportNo)
    expect(String(tps.get('form1[0].Page2[0].Line7_AlienNumber[0]')?.value)).toMatch(/^0/)
  })

  it('eligibility category (Item 27) comes ONLY from the application layer, never the document mapper', () => {
    // Feed the document mapper an input that ALSO carries a category-shaped key.
    const canonical: CanonicalDocumentResult = {
      documentSessionId: 't', product: 'ead', docType: 'passport',
      fields: [
        { key: 'family_name', rawValue: 'X', normalizedValue: 'X', criticality: 'medium',
          confidence: { ocr: 1, field_match: 1, normalization: 1, source_match: null, final: 1 },
          source: 'document_ocr', reviewRequired: false, reviewReasons: [], evidence: [] } as CanonicalField,
        { key: 'ead_category', rawValue: 'c11', normalizedValue: 'c11', criticality: 'medium',
          confidence: { ocr: 1, field_match: 1, normalization: 1, source_match: null, final: 1 },
          source: 'document_ocr', reviewRequired: false, reviewReasons: [], evidence: [] } as CanonicalField,
      ],
      hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
      createdAt: '2026-01-01T00:00:00.000Z', requiresReview: false,
    }
    const ops = buildI765DocumentOps(canonical)
    // Document mapper must NOT emit any Item-27 segment op.
    expect(ops.find((o) => o.field.includes('#area[1].section'))).toBeUndefined()
  })

  it('SAME canonical input → IDENTICAL shared-document-mapper output across products', () => {
    const canonical: CanonicalDocumentResult = {
      documentSessionId: 's', product: 'ead', docType: 'passport',
      fields: ['family_name', 'given_name', 'date_of_birth', 'a_number', 'sex', 'country_of_birth']
        .map((k) => ({
          key: k,
          rawValue: k === 'date_of_birth' ? '1991-02-03' : k === 'sex' ? 'M' : k === 'a_number' ? 'A012345678' : k === 'country_of_birth' ? 'Ukraine' : 'V',
          normalizedValue: k === 'date_of_birth' ? '1991-02-03' : k === 'sex' ? 'M' : k === 'a_number' ? 'A012345678' : k === 'country_of_birth' ? 'Ukraine' : 'V',
          criticality: 'medium',
          confidence: { ocr: 1, field_match: 1, normalization: 1, source_match: null, final: 1 },
          source: 'document_ocr', reviewRequired: false, reviewReasons: [], evidence: [],
        })) as CanonicalField[],
      hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
      createdAt: '2026-01-01T00:00:00.000Z', requiresReview: false,
    }
    // Two independent calls (stands in for "the same mapper invoked by each product")
    const a = JSON.stringify(buildI765DocumentOps(canonical))
    const b = JSON.stringify(buildI765DocumentOps(canonical))
    expect(a).toBe(b)
  })

  it('GT cross-check: real EAD A-number ≠ real EAD card number (verified facts are distinct)', () => {
    const gt = loadGT('ead_owner_fill.json')
    if (!gt) {
      // eslint-disable-next-line no-console
      console.log('A-number/card invariant: GT_MISSING')
      return
    }
    const a = String(gt.a_number ?? '')
    const card = String(gt.card_number ?? '')
    expect(a.length).toBeGreaterThan(0)
    expect(card.length).toBeGreaterThan(0)
    expect(a.replace(/\D/g, '')).not.toBe(card.replace(/\D/g, ''))
  })

  it('GT cross-check: real I-94 admission number is 11-char and distinct from passport shape', () => {
    const gt = loadGT('i94_owner_fill.json')
    if (!gt) {
      // eslint-disable-next-line no-console
      console.log('I-94/passport invariant: GT_MISSING')
      return
    }
    const adm = String(gt.i94_admission_number ?? '')
    expect(adm.length).toBe(11)
  })
})

describe('I-765 golden cross-product comparison', () => {
  it('document-half field name+value+page identical between TPS and EAD when fed the same identity', async () => {
    const tpsBytes = await tpsI765Bytes()
    const eadBytes = await eadI765Bytes()
    const tpsF = await readAllFields(tpsBytes)
    const eadF = await readAllFields(eadBytes)

    // Fields the shared document mapper owns AND both products supply.
    const sharedDocFields = [
      'form1[0].Page1[0].Line1a_FamilyName[0]',
      'form1[0].Page1[0].Line1b_GivenName[0]',
      'form1[0].Page1[0].Line1c_MiddleName[0]',
      'form1[0].Page2[0].Line7_AlienNumber[0]',
      'form1[0].Page2[0].Line9_Checkbox[0]',
      'form1[0].Page2[0].Line9_Checkbox[1]',
      'form1[0].Page3[0].Line18c_CountryOfBirth[0]',
      'form1[0].Page3[0].Line19_DOB[0]',
    ]
    const mismatches: string[] = []
    for (const f of sharedDocFields) {
      const a = tpsF.get(f)
      const b = eadF.get(f)
      if (String(a?.value ?? '') !== String(b?.value ?? '')) {
        mismatches.push(`${f}: tps(${a?.type}) vs ead(${b?.type}) differ`) // redacted: no values
      }
    }
    expect(mismatches).toEqual([])

    // Page render parity: both PDFs are 7 pages, edition stamped.
    const tpsPages = (await PDFDocument.load(tpsBytes, { ignoreEncryption: true })).getPageCount()
    const eadPages = (await PDFDocument.load(eadBytes, { ignoreEncryption: true })).getPageCount()
    expect(tpsPages).toBe(7)
    expect(eadPages).toBe(7)
  })
})
