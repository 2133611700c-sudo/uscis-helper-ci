/**
 * I-821 field-by-field validation harness (Phase 2B, Agent 1).
 *
 * Goal: validate EVERY mapped (and every relevant unmapped) AcroForm field of
 * the edition-locked official I-821 (Edition 01/20/25) along the full chain:
 *
 *   synthetic TPSAnswers → buildI821Ops → buildPacket → generated I-821.pdf
 *     → readAllAcroFields → AcroForm value
 *
 * Method:
 *   1. Build a synthetic, fully-populated TPSAnswers fixture (NO real PII).
 *   2. Generate the real I-821 PDF via buildPacket (same code path as prod).
 *   3. Read back every AcroForm field with pdf-lib.
 *   4. For every op the mapper emits, assert the written value matches intent.
 *   5. For the high-risk identity / legal fields, assert PHYSICAL placement:
 *      the value lands in the cell that corresponds to the printed question,
 *      not merely in a field whose internal AcroForm name looks plausible.
 *   6. Assert that fields intentionally left for user entry are EMPTY and never
 *      stale/fabricated (signature in paper mode, "other dates of birth used",
 *      countries of residence/citizenship name cells, etc.).
 *
 * Edition footer (01/20/25) is guarded by packetBuilder.test.ts already; this
 * suite focuses on per-field correctness and anti-fabrication.
 *
 * Physical-placement ground truth (verified against the rendered PDF widget
 * rectangles + pdftotext -bbox labels during Phase 2B authoring):
 *   - Page 2 Items 2.a–3.c (x≈120, "Other Names Used")  → other_names[].
 *   - Page 2 Item 10 (y≈588)  → applicant DOB.
 *   - Page 2 Item 11 (y≈462/492, "Other Dates of Birth Used") → ALIAS DOBs only.
 *   - Page 2 Items 15.a–d (x≈342, "Countries of Residence")   → NOT names.
 *   - Page 2 Items 16.a–d (x≈342, "Countries of Citizenship") → NOT names.
 */

import { describe, it, expect, vi } from 'vitest'
import JSZip from 'jszip'
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib'

import { buildPacket } from '../packetBuilder'
import { buildI821Ops } from '../forms/i821FieldMap'
import type { TPSAnswers } from '../answers'

vi.setConfig({ testTimeout: 120_000 })

// ── Synthetic, fully-populated fixture (NO real PII) ─────────────────────────
// Every value is an obvious placeholder so a leak into the wrong cell is
// visually unmistakable in a failure message (lengths only are printed).
const fullFixture: TPSAnswers = {
  family_name: 'SAMPLEFAMILY',
  given_name: 'SAMPLEGIVEN',
  middle_name: 'SAMPLEMIDDLE',
  other_names: [
    { family: 'ALIASFAMA', given: 'ALIASGIVA', middle: 'ALIASMIDA' },
    { family: 'ALIASFAMB', given: 'ALIASGIVB', middle: 'ALIASMIDB' },
  ],
  dob: '1980-01-15',
  sex: 'M',
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  a_number: '123456789',
  uscis_online_account: '111122223333',
  ssn: '000112222',
  city_of_birth: 'SAMPLECITY',
  marital_status: 'married',
  passport_number: 'PX0000000',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date: '2030-12-31',
  us_address_street: '100 Sample St',
  us_address_unit_type: 'apt',
  us_address_unit_number: '8',
  us_address_city: 'Sampleville',
  us_address_state: 'CA',
  us_address_zip: '90001',
  mailing_same_as_physical: true,
  last_entry_date: '2023-05-01',
  i94_admission_number: '00000000001',
  status_at_last_entry: 'PAROLE',
  port_of_entry_city: 'Sample Port',
  port_of_entry_state: 'NY',
  authorized_stay: 'D/S',
  filing_path: 'initial',
  wants_ead: true,
  ead_category: 'c19',
  daytime_phone: '5550000000',
  email: 'sample@example.invalid',
  ethnicity: 'not_hispanic',
  race_white: true,
  eye_color: 'brown',
  hair_color: 'brown',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
}

function toUscis(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

async function readAllAcroFields(
  pdfBytes: Uint8Array,
): Promise<Map<string, { type: string; value: string | boolean | null }>> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const result = new Map<string, { type: string; value: string | boolean | null }>()
  for (const field of form.getFields()) {
    const name = field.getName()
    if (field instanceof PDFTextField) {
      result.set(name, { type: 'text', value: field.getText() ?? null })
    } else if (field instanceof PDFCheckBox) {
      result.set(name, { type: 'checkbox', value: field.isChecked() })
    } else if (field instanceof PDFDropdown) {
      const sel = field.getSelected()
      result.set(name, { type: 'choice', value: sel.length > 0 ? sel[0] : null })
    }
  }
  return result
}

async function generateI821Fields() {
  const result = await buildPacket(fullFixture)
  const zip = await JSZip.loadAsync(result.zipBytes)
  const pdfBytes = await zip.file('I-821.pdf')!.async('uint8array')
  return readAllAcroFields(pdfBytes)
}

// Fields the prod prefiller legitimately cannot write (USCIS PDF dictionary
// drift in this edition — the Part7_Item4c_YN widgets are absent).
const KNOWN_MISSING = new Set([
  'form1[0].Page07[0].Part7_Item4c_YN[0]',
  'form1[0].Page07[0].Part7_Item4c_YN[1]',
])

describe('I-821 field-by-field — every mapped op lands with the intended value', () => {
  it('every text/checkbox/choice op reads back correctly', async () => {
    const fields = await generateI821Fields()
    const ops = buildI821Ops(fullFixture)
    const mismatches: string[] = []
    let verified = 0

    for (const op of ops) {
      if (KNOWN_MISSING.has(op.field)) continue
      const entry = fields.get(op.field)
      if (!entry) {
        if (op.value && String(op.value).length > 0) mismatches.push(`MISSING: ${op.field}`)
        continue
      }
      if (op.kind === 'checkbox') {
        const expected = op.value === true
        if (entry.value !== expected) {
          mismatches.push(`CHECKBOX_WRONG: ${op.field} (expected ${expected}, got ${entry.value})`)
        }
      } else {
        const expected = String(op.value)
        const actual = String(entry.value ?? '')
        if (actual !== expected) {
          // Mask PII: report only field name + length delta.
          mismatches.push(`VALUE_WRONG: ${op.field} (expected ${expected.length} chars, got ${actual.length})`)
        }
      }
      verified++
    }

    expect(verified).toBeGreaterThanOrEqual(80)
    expect(mismatches).toEqual([])
  })
})

describe('I-821 special-focus — high-risk identity/legal fields by PHYSICAL placement', () => {
  it('legal name (Page 1, Item 1.a-c) holds the applicant name', async () => {
    const f = await generateI821Fields()
    expect(f.get('form1[0].Page01[0].Part2_Item1_FamilyName[0]')?.value).toBe('SAMPLEFAMILY')
    expect(f.get('form1[0].Page01[0].Part2_Item1_GivenName[0]')?.value).toBe('SAMPLEGIVEN')
    expect(f.get('form1[0].Page01[0].Part2_Item1_MiddleName[0]')?.value).toBe('SAMPLEMIDDLE')
  })

  it('applicant DOB lands in Item 10, NOT in the "Other Dates of Birth Used" cells (Item 11)', async () => {
    const f = await generateI821Fields()
    const dob = toUscis(fullFixture.dob)
    // Item 10 = the applicant's date of birth.
    expect(f.get('form1[0].Page02[0].Part2_Item10_DateOfBirth[0]')?.value).toBe(dob)
    // Item 11.a / 11.b = "Other Dates of Birth Used (if any)". The applicant
    // has used no alias DOB, so these MUST be empty. Writing the real DOB here
    // is a fabrication (asserts an alias DOB the user never claimed).
    expect(f.get('form1[0].Page02[0].Part2_Item11_DateOfBirth[0]')?.value || '').toBe('')
    expect(f.get('form1[0].Page02[0].Part2_Item11_DateOfBirth[1]')?.value || '').toBe('')
  })

  it('other names land in the "Other Names Used" cells (Items 2.a-3.c), NOT in country fields', async () => {
    const f = await generateI821Fields()
    // Items 2.a-2.c = first other-name slot.
    expect(f.get('form1[0].Page02[0].Part2_Item2_FamilyName[0]')?.value).toBe('ALIASFAMA')
    expect(f.get('form1[0].Page02[0].Part2_Item2_GivenName[0]')?.value).toBe('ALIASGIVA')
    expect(f.get('form1[0].Page02[0].Part2_Item2_MiddleName[0]')?.value).toBe('ALIASMIDA')
    // Items 3.a-3.c = second other-name slot.
    expect(f.get('form1[0].Page02[0].Part2_Item3_FamilyName[0]')?.value).toBe('ALIASFAMB')
    expect(f.get('form1[0].Page02[0].Part2_Item3_GivenName[0]')?.value).toBe('ALIASGIVB')
    expect(f.get('form1[0].Page02[0].Part2_Item3_MiddleName[0]')?.value).toBe('ALIASMIDB')
  })

  it('Items 15/16 (Countries of Residence / Citizenship) are NOT polluted with name data', async () => {
    const f = await generateI821Fields()
    // These cells ask for COUNTRIES, never names. They must stay empty
    // (the mapper has no country-of-residence source to populate them).
    for (const fld of [
      'form1[0].Page02[0].Part2_Item15a[0]',
      'form1[0].Page02[0].Part2_Item15b[0]',
      'form1[0].Page02[0].Part2_Item15c[0]',
      'form1[0].Page02[0].Part2_Item16a[0]',
      'form1[0].Page02[0].Part2_Item16b[0]',
      'form1[0].Page02[0].Part2_Item16c[0]',
    ]) {
      expect(f.get(fld)?.value || '', `${fld} must not contain name/alias data`).toBe('')
    }
  })

  it('A-Number, USCIS account, SSN, passport, I-94 hold exactly the intended values', async () => {
    const f = await generateI821Fields()
    expect(f.get('form1[0].Page02[0].Part2_Item7_AlienNumber[0]')?.value).toBe('123456789')
    expect(f.get('form1[0].Page02[0].#area[0].Part2_Item8_AcctIdentifier[0]')?.value).toBe('111122223333')
    expect(f.get('form1[0].Page02[0].Part2_Item9_SocialSecurityNumber[0]')?.value).toBe('000112222')
    expect(f.get('form1[0].Page03[0].Part2_Item22_Passport[0]')?.value).toBe('PX0000000')
    expect(f.get('form1[0].Page03[0].Part2_Item22_I94[0]')?.value).toBe('00000000001')
  })

  it('date + place of birth, country of nationality (TPS country) are correct', async () => {
    const f = await generateI821Fields()
    expect(f.get('form1[0].Page02[0].Part2_Item13_CityOrTown[0]')?.value).toBe('SAMPLECITY')
    expect(f.get('form1[0].Page02[0].Part2_Item14_CountryofBirth[0]')?.value).toBe('Ukraine')
    expect(f.get('form1[0].Page01[0].Part1_TPScountry[0]')?.value).toBe('Ukraine')
  })

  it('entry info: date of last entry, status at entry, port of entry, authorized stay', async () => {
    const f = await generateI821Fields()
    // Physically Item 19 (date of last entry) despite internal name P2_Line7.
    expect(f.get('form1[0].Page03[0].P2_Line7_DateOfBirth[0]')?.value).toBe(toUscis(fullFixture.last_entry_date))
    expect(f.get('form1[0].Page03[0].Part2_Item19_ImmigrationStatus[0]')?.value).toBe('PAROLE')
    expect(f.get('form1[0].Page03[0].Part2_Item20_CityOrTown[0]')?.value).toBe('Sample Port')
    expect(f.get('form1[0].Page03[0].Part2_Item20_State[0]')?.value).toBe('NY')
    expect(f.get('form1[0].Page03[0].Part2_Item21_AuthorizedPdofStay[0]')?.value).toBe('D/S')
  })

  it('passport country of issuance + expiration are correct', async () => {
    const f = await generateI821Fields()
    expect(f.get('form1[0].Page03[0].Part2_Item24_CountryofIssuance[0]')?.value).toBe('Ukraine')
    expect(f.get('form1[0].Page03[0].Part2_Item24_PassportExpiration[0]')?.value).toBe(toUscis(fullFixture.passport_expiration_date))
  })
})

describe('I-821 anti-fabrication — fields left for user entry stay EMPTY', () => {
  it('signature + signature date are blank in paper mode (no _signature_mode set)', async () => {
    const f = await generateI821Fields()
    // Fixture has no _signature_mode → paper signing → must be blank.
    expect(f.get('form1[0].Page11[0].Part8_Item6a_Signature[0]')?.value || '').toBe('')
    expect(f.get('form1[0].Page11[0].Part8_Item6b_DateofSignature[0]')?.value || '').toBe('')
  })

  it('interpreter (Part 9) and preparer (Part 10) sections are never auto-filled', async () => {
    const f = await generateI821Fields()
    for (const [name, entry] of f) {
      if (/Part9|Part10|Interpreter|Preparer/i.test(name)) {
        if (entry.type === 'text') {
          expect(entry.value || '', `${name} must be empty (self-prepared)`).toBe('')
        } else if (entry.type === 'checkbox') {
          expect(entry.value, `${name} must be unchecked (self-prepared)`).toBe(false)
        }
      }
    }
  })
})

describe('I-821 A-Number normalization — maxLength=9 cell must never drop the value', () => {
  // Regression: the Part2_Item7_AlienNumber cell is maxLength=9. A value carrying the
  // "A" prefix or USCIS dashes is rejected by pdf-lib and the field comes out BLANK on
  // the officer-facing PDF (same class of bug the shared I-765 mapper had). The mapper
  // must normalize to the 9 trailing digits, preserving leading zeros. Synthetic only.
  const FIELD = 'form1[0].Page02[0].Part2_Item7_AlienNumber[0]'
  const aNumberOp = (raw: string) =>
    buildI821Ops({ ...fullFixture, a_number: raw }).find((o) => o.field === FIELD)

  it.each([
    ['A123456789', '123456789'],
    ['012-345-678', '012345678'],
    ['A-012-345-678', '012345678'],
    ['123456789', '123456789'],
  ])('normalizes %s → %s (9 digits, leading zeros kept)', (raw, expected) => {
    expect(aNumberOp(raw)?.value).toBe(expected)
  })
})
