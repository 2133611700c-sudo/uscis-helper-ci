/**
 * provenance.test.ts — Phase 1 provenance sidecar tests.
 *
 * Verifies:
 *   1. Factory helpers create correct provenance records.
 *   2. Audit rows link canonical fields to PDF fields with provenance.
 *   3. Unknown provenance is surfaced, not hidden.
 *   4. Summary produces counts without PII.
 *   5. No raw PII in any output.
 */

import { describe, it, expect } from 'vitest'

import {
  ocrProvenance,
  manualProvenance,
  defaultProvenance,
  buildAuditRows,
  summarizeProvenance,
  buildProvenanceFromWizard,
  type ProvenanceMap,
  type PdfAuditRow,
  type ProvenanceInput,
} from '../provenance'

describe('provenance factory helpers', () => {
  it('ocrProvenance creates auto_with_source record', () => {
    const p = ocrProvenance('passport', 'ocr_mrz', 0.95, 'family_name')
    expect(p.source_document_type).toBe('passport')
    expect(p.extraction_method).toBe('ocr_mrz')
    expect(p.confidence).toBe(0.95)
    expect(p.value_status).toBe('auto_with_source')
    expect(p.user_review_status).toBe('unreviewed')
  })

  it('ocrProvenance with reviewed=true sets reviewed status', () => {
    const p = ocrProvenance('i94', 'ai_brain', 0.8, 'dob', true)
    expect(p.user_review_status).toBe('reviewed')
  })

  it('manualProvenance creates user_manual record', () => {
    const p = manualProvenance()
    expect(p.source_document_type).toBe('user_manual')
    expect(p.extraction_method).toBe('user_manual')
    expect(p.confidence).toBeNull()
    expect(p.value_status).toBe('user_manual')
  })

  it('manualProvenance with corrected=true sets corrected status', () => {
    const p = manualProvenance(true)
    expect(p.user_review_status).toBe('corrected')
  })

  it('defaultProvenance creates system_default record', () => {
    const p = defaultProvenance('country_of_nationality')
    expect(p.value_status).toBe('system_default')
    expect(p.extraction_method).toBe('system_default')
  })
})

describe('buildAuditRows', () => {
  const ops = [
    { field: 'form1[0].Page01[0].Part2_Item1_FamilyName[0]', kind: 'text' as const, value: 'TEST' },
    { field: 'form1[0].Page01[0].Part2_Item1_GivenName[0]', kind: 'text' as const, value: 'USER' },
    { field: 'form1[0].Page01[0].Part1_Item1_ApplicationType[0]', kind: 'checkbox' as const, value: true },
  ]

  it('creates audit row for each op', () => {
    const rows = buildAuditRows(ops, 'I-821', null, new Set(ops.map(o => o.field)))
    expect(rows).toHaveLength(3)
  })

  it('marks unknown provenance when no sidecar provided', () => {
    const rows = buildAuditRows(ops, 'I-821', null, new Set())
    for (const r of rows) {
      expect(r.source_document_type).toBe('unknown')
      expect(r.extraction_method).toBe('unknown')
    }
  })

  it('attaches provenance from sidecar when available', () => {
    const prov: ProvenanceMap = {
      family_name: ocrProvenance('passport', 'ocr_mrz', 0.95, 'family_name'),
    }
    const rows = buildAuditRows(ops, 'I-821', prov, new Set(ops.map(o => o.field)))
    const fnRow = rows.find(r => r.canonical_field === 'family_name')
    expect(fnRow?.source_document_type).toBe('passport')
    expect(fnRow?.extraction_method).toBe('ocr_mrz')
    expect(fnRow?.confidence).toBe(0.95)
  })

  it('marks pdf_written correctly', () => {
    const applied = new Set(['form1[0].Page01[0].Part2_Item1_FamilyName[0]'])
    const rows = buildAuditRows(ops, 'I-821', null, applied)
    const fnRow = rows.find(r => r.canonical_field === 'family_name')
    const gnRow = rows.find(r => r.canonical_field === 'given_name')
    expect(fnRow?.pdf_written).toBe(true)
    expect(gnRow?.pdf_written).toBe(false)
  })
})

describe('summarizeProvenance', () => {
  it('counts source types without PII', () => {
    const rows: PdfAuditRow[] = [
      { canonical_field: 'family_name', pdf_form: 'I-821', pdf_field_name: 'f1', op_kind: 'text', source_document_type: 'passport', extraction_method: 'ocr_mrz', confidence: 0.95, user_review_status: 'reviewed', pdf_written: true },
      { canonical_field: 'dob', pdf_form: 'I-821', pdf_field_name: 'f2', op_kind: 'text', source_document_type: 'passport', extraction_method: 'ocr_mrz', confidence: 0.9, user_review_status: 'reviewed', pdf_written: true },
      { canonical_field: 'email', pdf_form: 'I-821', pdf_field_name: 'f3', op_kind: 'text', source_document_type: 'user_manual', extraction_method: 'user_manual', confidence: null, user_review_status: 'manual_entry', pdf_written: true },
      { canonical_field: 'phone', pdf_form: 'I-821', pdf_field_name: 'f4', op_kind: 'text', source_document_type: 'unknown', extraction_method: 'unknown', confidence: null, user_review_status: 'unknown', pdf_written: true },
    ]
    const s = summarizeProvenance(rows)
    expect(s.total_fields).toBe(4)
    expect(s.auto_with_source).toBe(2)
    expect(s.user_manual).toBe(1)
    expect(s.unknown_provenance).toBe(1)
    expect(s.source_breakdown['passport']).toBe(2)
    expect(s.source_breakdown['user_manual']).toBe(1)
    expect(s.source_breakdown['unknown']).toBe(1)
  })

  it('summary output contains zero raw PII values', () => {
    const rows: PdfAuditRow[] = [
      { canonical_field: 'family_name', pdf_form: 'I-821', pdf_field_name: 'f1', op_kind: 'text', source_document_type: 'passport', extraction_method: 'ocr_mrz', confidence: 0.95, user_review_status: 'reviewed', pdf_written: true },
    ]
    const s = summarizeProvenance(rows)
    const serialized = JSON.stringify(s)
    // No actual values like names, numbers, dates should appear
    expect(serialized).not.toContain('TESTFAMILY')
    expect(serialized).not.toContain('1980')
    expect(serialized).not.toContain('XX0000000')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: buildProvenanceFromWizard tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildProvenanceFromWizard', () => {
  const passportField = (field: string, value: string, conf = 0.95): ProvenanceInput => ({
    value,
    source: 'ocr_mrz',
    doc_slot: 'passport',
    confidence: conf,
    source_field: field,
  })

  const i94Field = (field: string, value: string, conf = 0.85): ProvenanceInput => ({
    value,
    source: 'ai_brain',
    doc_slot: 'i94',
    confidence: conf,
    source_field: field,
  })

  const dlField = (field: string, value: string): ProvenanceInput => ({
    value,
    source: 'ocr_keyword',
    doc_slot: 'dl',
    confidence: 0.9,
    source_field: field,
  })

  it('preserves passport OCR provenance for identity fields', () => {
    const merged: Record<string, ProvenanceInput> = {
      family_name: passportField('family_name', 'TESTNAME'),
      dob: passportField('dob', '1990-01-01'),
    }
    const map = buildProvenanceFromWizard(merged, {}, ['family_name', 'dob'])
    expect(map.family_name.source_document_type).toBe('passport')
    expect(map.family_name.extraction_method).toBe('ocr_mrz')
    expect(map.family_name.confidence).toBe(0.95)
    expect(map.family_name.value_status).toBe('auto_with_source')
    expect(map.dob.source_document_type).toBe('passport')
  })

  it('preserves I-94 Brain provenance for immigration fields', () => {
    const merged: Record<string, ProvenanceInput> = {
      last_entry_date: i94Field('last_entry_date', '2022-09-09'),
      status_at_last_entry: i94Field('status_at_last_entry', 'UH'),
    }
    const map = buildProvenanceFromWizard(merged, {}, ['last_entry_date', 'status_at_last_entry'])
    expect(map.last_entry_date.source_document_type).toBe('i94')
    expect(map.last_entry_date.extraction_method).toBe('ai_brain')
    expect(map.last_entry_date.confidence).toBe(0.85)
  })

  it('preserves booklet OCR provenance for booklet slot fields', () => {
    const merged: Record<string, ProvenanceInput> = {
      family_name: {
        value: 'Ivanenko',
        source: 'dual_ocr_crossref',
        doc_slot: 'booklet',
        confidence: 0.9,
        source_field: 'family_name',
      },
      city_of_birth: {
        value: 'Vinnytsia',
        source: 'dual_ocr_crossref',
        doc_slot: 'booklet',
        confidence: 0.9,
        source_field: 'city_of_birth',
      },
    }
    const map = buildProvenanceFromWizard(merged, {}, ['family_name', 'city_of_birth'])
    expect(map.family_name.source_document_type).toBe('booklet')
    expect(map.city_of_birth.source_document_type).toBe('booklet')
    expect(map.family_name.value_status).toBe('auto_with_source')
  })

  it('marks user correction when manual override differs from OCR', () => {
    const merged: Record<string, ProvenanceInput> = {
      family_name: passportField('family_name', 'TESTENKO'),
    }
    const manual = { family_name: 'TESTINKO' } // user corrected spelling
    const map = buildProvenanceFromWizard(merged, manual, ['family_name'])
    expect(map.family_name.user_review_status).toBe('corrected')
    expect(map.family_name.value_status).toBe('user_manual')
  })

  it('keeps OCR provenance when manual matches OCR (user confirmed)', () => {
    const merged: Record<string, ProvenanceInput> = {
      family_name: passportField('family_name', 'TESTENKO'),
    }
    const manual = { family_name: 'TESTENKO' } // same value = confirmed
    const map = buildProvenanceFromWizard(merged, manual, ['family_name'])
    expect(map.family_name.value_status).toBe('auto_with_source')
    expect(map.family_name.source_document_type).toBe('passport')
  })

  it('marks manual entry when no OCR source exists', () => {
    const merged: Record<string, ProvenanceInput> = {}
    const manual = { daytime_phone: '2131234567' }
    const map = buildProvenanceFromWizard(merged, manual, ['daytime_phone'])
    expect(map.daytime_phone.value_status).toBe('user_manual')
    expect(map.daytime_phone.user_review_status).toBe('manual_entry')
  })

  it('marks system default only for workflow fields, not biographic', () => {
    const merged: Record<string, ProvenanceInput> = {}
    const map = buildProvenanceFromWizard(merged, {}, ['mailing_same_as_physical'])
    expect(map.mailing_same_as_physical.value_status).toBe('system_default')
    expect(map.mailing_same_as_physical.extraction_method).toBe('system_default')
  })

  it('DL cannot provide immigration provenance (slot firewall)', () => {
    const merged: Record<string, ProvenanceInput> = {
      a_number: dlField('a_number', '123456789'),
      last_entry_date: dlField('last_entry_date', '2022-01-01'),
      passport_number: dlField('passport_number', 'EK790396'),
    }
    const map = buildProvenanceFromWizard(merged, {}, ['a_number', 'last_entry_date', 'passport_number'])
    // All three should be rejected as DL provenance for immigration fields
    for (const key of ['a_number', 'last_entry_date', 'passport_number']) {
      expect(map[key].source_document_type).not.toBe('driver_license')
    }
  })

  it('DL CAN provide address provenance (allowed cross-check)', () => {
    const merged: Record<string, ProvenanceInput> = {
      us_address_street: dlField('us_address_street', '1213 GORDON ST'),
      us_address_city: dlField('us_address_city', 'LOS ANGELES'),
    }
    const map = buildProvenanceFromWizard(merged, {}, ['us_address_street', 'us_address_city'])
    expect(map.us_address_street.source_document_type).toBe('driver_license')
    expect(map.us_address_city.source_document_type).toBe('driver_license')
  })

  it('omits provenance entry for fields with no source and no default', () => {
    const merged: Record<string, ProvenanceInput> = {}
    const map = buildProvenanceFromWizard(merged, {}, ['ssn'])
    expect(map.ssn).toBeUndefined()
  })

  it('auto field without provenance must fail audit (detected via audit rows)', () => {
    // Simulate: a field has a value in answers but no provenance entry
    const provMap: ProvenanceMap = {} // empty — no provenance for family_name
    const ops = [
      { field: 'Part2_FamilyName', kind: 'text' as const, value: 'SOME_VALUE' },
    ]
    const rows = buildAuditRows(ops, 'I-821', provMap, new Set(['Part2_FamilyName']))
    expect(rows[0].source_document_type).toBe('unknown')
    expect(rows[0].extraction_method).toBe('unknown')
    // This field is auto-filled (pdf_written=true) but has unknown provenance — audit flag
    expect(rows[0].pdf_written).toBe(true)
    expect(rows[0].user_review_status).toBe('unknown')
  })

  it('reverse mapping resolves I-821 PDF fields to canonical keys', () => {
    const provMap: ProvenanceMap = {
      family_name: ocrProvenance('passport', 'ocr_mrz', 0.95, 'family_name'),
      dob: ocrProvenance('passport', 'ocr_mrz', 0.95, 'dob'),
      us_address_street: ocrProvenance('driver_license', 'ocr_rule_parser', 0.9, 'us_address_street'),
      a_number: ocrProvenance('ead', 'ai_brain', 0.85, 'a_number'),
      passport_number: ocrProvenance('passport', 'ocr_mrz', 0.95, 'passport_number'),
      i94_admission_number: ocrProvenance('i94', 'ai_brain', 0.85, 'i94_admission_number'),
    }
    const ops = [
      { field: 'form1[0].Page01[0].Part2_Item1_FamilyName[0]', kind: 'text' as const, value: 'TEST' },
      { field: 'form1[0].Page02[0].Part2_Item10_DateOfBirth[0]', kind: 'text' as const, value: '01/01/1990' },
      { field: 'form1[0].Page02[0].Part2_Item4_StreetNumberName[0]', kind: 'text' as const, value: '123 ST' },
      { field: 'form1[0].Page02[0].Part2_Item7_AlienNumber[0]', kind: 'text' as const, value: '123456789' },
      { field: 'form1[0].Page03[0].Part2_Item22_Passport[0]', kind: 'text' as const, value: 'EK123456' },
      { field: 'form1[0].Page03[0].Part2_Item22_I94[0]', kind: 'text' as const, value: '12345678901' },
    ]
    const applied = new Set(ops.map(o => o.field))
    const rows = buildAuditRows(ops, 'I-821', provMap, applied)

    // All 6 should resolve to known canonical keys and find provenance
    expect(rows[0].canonical_field).toBe('family_name')
    expect(rows[0].source_document_type).toBe('passport')
    expect(rows[1].canonical_field).toBe('dob')
    expect(rows[1].source_document_type).toBe('passport')
    expect(rows[2].canonical_field).toBe('us_address_street')
    expect(rows[2].source_document_type).toBe('driver_license')
    expect(rows[3].canonical_field).toBe('a_number')
    expect(rows[3].source_document_type).toBe('ead')
    expect(rows[4].canonical_field).toBe('passport_number')
    expect(rows[4].source_document_type).toBe('passport')
    expect(rows[5].canonical_field).toBe('i94_admission_number')
    expect(rows[5].source_document_type).toBe('i94')
    // None should be 'unknown'
    for (const r of rows) {
      expect(r.source_document_type).not.toBe('unknown')
    }
  })

  it('reverse mapping resolves I-765 PDF fields to canonical keys', () => {
    const provMap: ProvenanceMap = {
      family_name: ocrProvenance('passport', 'ocr_mrz', 0.95, 'family_name'),
      dob: ocrProvenance('passport', 'ocr_mrz', 0.95, 'dob'),
      passport_number: ocrProvenance('passport', 'ocr_mrz', 0.95, 'passport_number'),
      last_entry_date: ocrProvenance('i94', 'ocr_rule_parser', 0.9, 'last_entry_date'),
    }
    const ops = [
      { field: 'form1[0].Page1[0].Line1a_FamilyName[0]', kind: 'text' as const, value: 'TEST' },
      { field: 'form1[0].Page3[0].Line19_DOB[0]', kind: 'text' as const, value: '01/01/1990' },
      { field: 'form1[0].Page3[0].Line20b_Passport[0]', kind: 'text' as const, value: 'EK123456' },
      { field: 'form1[0].Page3[0].Line21_DateOfLastEntry[0]', kind: 'text' as const, value: '09/09/2022' },
    ]
    const applied = new Set(ops.map(o => o.field))
    const rows = buildAuditRows(ops, 'I-765', provMap, applied)

    expect(rows[0].canonical_field).toBe('family_name')
    expect(rows[0].source_document_type).toBe('passport')
    expect(rows[1].canonical_field).toBe('dob')
    expect(rows[2].canonical_field).toBe('passport_number')
    expect(rows[3].canonical_field).toBe('last_entry_date')
    expect(rows[3].source_document_type).toBe('i94')
  })

  it('system_default no longer includes country_of_birth', () => {
    const merged: Record<string, ProvenanceInput> = {}
    const map = buildProvenanceFromWizard(merged, {}, ['country_of_birth'])
    // country_of_birth should NOT be auto-filled as system_default
    expect(map.country_of_birth).toBeUndefined()
  })
})
