/**
 * Golden-PDF parity harness for the shared I-765 document mapper (GAP-3).
 *
 * Proves the ONE shared canonical document mapper (buildI765DocumentOps) emits the
 * SAME document-derived I-765 AcroForm ops as each OLD product map for the
 * document half — field name, fill/empty, value, checkbox state — on synthetic
 * fixtures only (no PII).
 *
 * Method:
 *   1. Build a synthetic CanonicalDocumentResult whose RELEASED values equal the
 *      document inputs the old map consumed (country_of_birth already normalized
 *      at the boundary — proving normalizeCountryOfBirth moved OUT correctly).
 *   2. Run the shared mapper → ops(shared).
 *   3. Run the OLD map → ops(old); restrict to the document-derived field names.
 *   4. Compare per field key: SAME / DIFFERENT / EMPTY / EXTRA / MISSING.
 *
 * The product/user-declared fields the old maps own (application type, category,
 * address, race, english, contact, Line29, Line17) are intentionally NOT part of
 * the shared mapper and are excluded from the document-parity set.
 */
import { describe, it, expect } from 'vitest'
import type { CanonicalDocumentResult, CanonicalField, Criticality, SourceKind } from '../../types'
import { buildI765DocumentOps, type I765Op } from '../i765DocumentMapper'
import { buildEadI765Ops, type EadFieldData } from '@/lib/ead/i765FieldMap'
import { buildI765Ops } from '@/lib/tps/forms/i765FieldMap'
import type { TPSAnswers } from '@/lib/tps/answers'
import { normalizeCountryOfBirth } from '@/lib/tps/answers'

// ── Synthetic canonical-result builder (no OCR, no PII) ────────────────────────
function field(key: string, value: string): CanonicalField {
  return {
    key,
    rawValue: value,
    normalizedValue: value,
    // finalValue undefined ⇒ accessor falls back to normalizedValue (C3 not run).
    criticality: 'medium' as Criticality,
    confidence: { ocr: 1, field_match: 1, normalization: 1, source_match: null, final: 1 },
    source: 'document_ocr' as SourceKind,
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
  }
}

function canonicalFrom(pairs: Record<string, string>, docType = 'passport'): CanonicalDocumentResult {
  const fields = Object.entries(pairs)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => field(k, v))
  return {
    documentSessionId: 'synthetic-parity',
    product: 'ead',
    docType,
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    requiresReview: false,
  }
}

// ── Document-derived field-name set (what the shared mapper owns) ──────────────
const DOC_FIELDS = new Set<string>([
  'form1[0].Page1[0].Line1a_FamilyName[0]',
  'form1[0].Page1[0].Line1b_GivenName[0]',
  'form1[0].Page1[0].Line1c_MiddleName[0]',
  'form1[0].Page2[0].Line7_AlienNumber[0]',
  'form1[0].Page2[0].Line9_Checkbox[0]',
  'form1[0].Page2[0].Line9_Checkbox[1]',
  'form1[0].Page3[0].Line18a_CityTownOfBirth[0]',
  'form1[0].Page3[0].Line18b_CityTownOfBirth[0]',
  'form1[0].Page3[0].Line18c_CountryOfBirth[0]',
  'form1[0].Page3[0].Line19_DOB[0]',
  'form1[0].Page3[0].Line20b_Passport[0]',
  'form1[0].Page3[0].Line20d_CountryOfIssuance[0]',
  'form1[0].Page3[0].Line20e_ExpDate[0]',
  'form1[0].Page3[0].Line20a_I94Number[0]',
  'form1[0].Page3[0].Line21_DateOfLastEntry[0]',
  'form1[0].Page3[0].Line23_StatusLastEntry[0]',
  'form1[0].Page3[0].Line24_CurrentStatus[0]',
  'form1[0].Page3[0].place_entry[0]',
])

type Diff = { field: string; status: 'SAME' | 'DIFFERENT' | 'EXTRA' | 'MISSING' }

/** Compare two op-lists on the document field set. Redacted: never logs values. */
function diffDocOps(oldOps: I765Op[], sharedOps: I765Op[]): Diff[] {
  const oldDoc = new Map(oldOps.filter((o) => DOC_FIELDS.has(o.field)).map((o) => [o.field, o]))
  const sharedDoc = new Map(sharedOps.map((o) => [o.field, o]))
  const allKeys = new Set<string>([...oldDoc.keys(), ...sharedDoc.keys()])
  const diffs: Diff[] = []
  for (const k of allKeys) {
    const a = oldDoc.get(k)
    const b = sharedDoc.get(k)
    if (a && !b) diffs.push({ field: k, status: 'MISSING' }) // old had it, shared dropped
    else if (!a && b) diffs.push({ field: k, status: 'EXTRA' }) // shared invented
    else if (a && b) {
      const same = a.kind === b.kind && String(a.value) === String(b.value)
      diffs.push({ field: k, status: same ? 'SAME' : 'DIFFERENT' })
    }
  }
  return diffs
}

describe('I-765 document mapper parity — EAD (synthetic)', () => {
  it('shared mapper == OLD EAD map on document-derived fields', () => {
    // Synthetic EAD input. country already at boundary (EAD assumes normalized upstream).
    const ead: EadFieldData = {
      appType: 'new',
      category: 'c11',
      firstName: 'Given',
      lastName: 'Family',
      middleName: 'Middle',
      dob: '1990-04-15',
      countryOfBirth: 'Ukraine',
      alienNumber: 'A123456789',
      gender: 'female',
      usAddress: '1 Test St, City, CA 90000',
    }
    const oldOps = buildEadI765Ops(ead)

    const canonical = canonicalFrom({
      family_name: ead.lastName,
      given_name: ead.firstName,
      middle_name: ead.middleName,
      date_of_birth: ead.dob,
      country_of_birth: ead.countryOfBirth,
      a_number: ead.alienNumber,
      sex: ead.gender === 'female' ? 'F' : ead.gender === 'male' ? 'M' : '',
    })
    const sharedOps = buildI765DocumentOps(canonical)

    const diffs = diffDocOps(oldOps, sharedOps)
    const bad = diffs.filter((d) => d.status !== 'SAME')
    // Redacted report
    if (bad.length) console.log('EAD parity diffs:', bad)
    expect(bad).toEqual([])
    // Sanity: we actually compared the expected document fields
    expect(diffs.filter((d) => d.status === 'SAME').length).toBeGreaterThanOrEqual(7)
  })

  it('EAD: absent A-number / gender produce NO op in either map', () => {
    const ead: EadFieldData = {
      appType: 'new', category: 'other',
      firstName: 'G', lastName: 'F', middleName: '',
      dob: '1990-04-15', countryOfBirth: 'Ukraine',
      alienNumber: '', gender: '', usAddress: '',
    }
    const oldOps = buildEadI765Ops(ead)
    const canonical = canonicalFrom({
      family_name: ead.lastName, given_name: ead.firstName,
      date_of_birth: ead.dob, country_of_birth: ead.countryOfBirth,
    })
    const sharedOps = buildI765DocumentOps(canonical)
    // shared emits no A-number op (absent)
    expect(sharedOps.find((o) => o.field === 'form1[0].Page2[0].Line7_AlienNumber[0]')).toBeUndefined()
    // shared emits no gender op (absent sex)
    expect(sharedOps.find((o) => o.field.includes('Line9_Checkbox'))).toBeUndefined()
    // old EAD map DOES force gender checkboxes off + has middle-name op — those are
    // EAD-layer defaults, not document facts. Confirm they are NOT in shared (EXTRA=0).
    const diffs = diffDocOps(oldOps, sharedOps)
    expect(diffs.filter((d) => d.status === 'EXTRA')).toEqual([])
  })
})

describe('I-765 document mapper parity — TPS (synthetic)', () => {
  function tpsAnswers(over: Partial<TPSAnswers> = {}): TPSAnswers {
    // Minimal synthetic TPSAnswers — only document-derived + required-by-typing fields.
    return {
      family_name: 'Family',
      given_name: 'Given',
      middle_name: 'Middle',
      dob: '1985-12-03',
      sex: 'M',
      country_of_birth: 'ВІННИЦЬКА ОБЛ.',
      country_of_nationality: 'Ukraine',
      city_of_birth: 'Vinnytsia',
      province_of_birth: 'Vinnytsia Oblast',
      a_number: 'A987654321',
      passport_number: 'FA123456',
      passport_country_of_issuance: 'Ukraine',
      passport_expiration_date: '2030-06-01',
      i94_admission_number: '12345678901',
      last_entry_date: '2023-01-10',
      status_at_last_entry: 'U4U',
      current_immigration_status: 'parolee',
      place_of_last_entry: 'JFK',
      // product/user fields the shared mapper does NOT own:
      filing_path: 'initial',
      us_address_street: '1 St', us_address_city: 'C', us_address_state: 'CA',
      us_address_zip: '90000', email: 't@e.co', daytime_phone: '5551234567',
      ead_category: 'a12',
      ...over,
    } as unknown as TPSAnswers
  }

  it('shared mapper == OLD TPS map on document-derived fields (country normalized at boundary)', () => {
    const a = tpsAnswers()
    const oldOps = buildI765Ops(a)

    // BOUNDARY: normalizeCountryOfBirth now runs OUTSIDE the mapper. The canonical
    // value fed in is the already-normalized country — proving the move is correct.
    const normalizedCountry = normalizeCountryOfBirth(a.country_of_birth, a.country_of_nationality)
    expect(normalizedCountry).toBe('Ukraine') // oblast → country at the boundary

    const canonical = canonicalFrom({
      family_name: a.family_name,
      given_name: a.given_name,
      middle_name: a.middle_name ?? '',
      date_of_birth: a.dob,
      sex: a.sex ?? '',
      country_of_birth: normalizedCountry,
      city_of_birth: a.city_of_birth ?? '',
      province_of_birth: a.province_of_birth ?? '',
      a_number: a.a_number ?? '',
      passport_number: a.passport_number,
      passport_country_of_issuance: a.passport_country_of_issuance,
      passport_expiration_date: a.passport_expiration_date,
      i94_admission_number: a.i94_admission_number ?? '',
      i94_date_of_entry: a.last_entry_date,
      status_at_last_entry: a.status_at_last_entry ?? '',
      current_immigration_status: a.current_immigration_status ?? '',
      place_of_last_entry: a.place_of_last_entry ?? '',
    })
    const sharedOps = buildI765DocumentOps(canonical)

    const diffs = diffDocOps(oldOps, sharedOps)
    const bad = diffs.filter((d) => d.status !== 'SAME')
    if (bad.length) console.log('TPS parity diffs:', bad)
    expect(bad).toEqual([])
    expect(diffs.filter((d) => d.status === 'SAME').length).toBeGreaterThanOrEqual(15)
  })

  it('TPS: the normalized country the boundary produces is what the OLD map wrote', () => {
    const a = tpsAnswers()
    const oldOps = buildI765Ops(a)
    const oldCountryOp = oldOps.find((o) => o.field === 'form1[0].Page3[0].Line18c_CountryOfBirth[0]')
    expect(oldCountryOp?.value).toBe('Ukraine') // old map normalized internally
    // shared map, fed the boundary-normalized value, emits the identical string.
    const canonical = canonicalFrom({
      country_of_birth: normalizeCountryOfBirth(a.country_of_birth, a.country_of_nationality),
    })
    const sharedOps = buildI765DocumentOps(canonical)
    const sharedCountryOp = sharedOps.find((o) => o.field === 'form1[0].Page3[0].Line18c_CountryOfBirth[0]')
    expect(sharedCountryOp?.value).toBe(oldCountryOp?.value)
  })

  it('TPS: shared mapper owns NO product/user fields (Line29, race, english, address, Item27)', () => {
    const a = tpsAnswers()
    const canonical = canonicalFrom({ family_name: a.family_name, given_name: a.given_name })
    const sharedOps = buildI765DocumentOps(canonical)
    const ownedByProduct = [
      'form1[0].Page3[0].PtLine29_YesNo[0]',          // previously filed
      'form1[0].Page2[0].Line10_Checkbox[0]',          // race
      'form1[0].Page4[0].Pt3Line1Checkbox[0]',         // english
      'form1[0].Page2[0].Line4b_StreetNumberName[0]',  // address
      'form1[0].Page3[0].#area[1].section_1[0]',        // Item 27 category
      'form1[0].Page1[0].Part1_Checkbox[0]',           // application type
      'form1[0].Page2[0].Line17a_CountryOfBirth[0]',   // citizenship line
    ]
    for (const f of ownedByProduct) {
      expect(sharedOps.find((o) => o.field === f), `shared mapper must NOT own ${f}`).toBeUndefined()
    }
  })
})
