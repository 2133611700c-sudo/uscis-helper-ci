/**
 * E2E Pipeline Integration Test
 *
 * Tests the INTEGRATION between modules, not individual extraction
 * (module tests cover that). Verifies: merge logic, provenance mapping,
 * packet generation, ZIP contents, audit report.
 *
 * Uses ProvenanceInput directly (simulating post-module output)
 * instead of raw OCR → module (which is tested in module-specific tests).
 */
import { describe, expect, it } from 'vitest'
import { buildProvenanceFromWizard, type ProvenanceInput } from '@/lib/tps/provenance'
import { buildPacket } from '@/lib/tps/packetBuilder'
import type { TPSAnswers } from '@/lib/tps/answers'
import JSZip from 'jszip'

// ── Simulated post-module extracted fields (fake data) ──────────────────
const PASSPORT_FIELDS: Record<string, ProvenanceInput> = {
  family_name: { value: 'BONDARENKO', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  given_name: { value: 'OLENA', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  dob: { value: '1990-06-15', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  sex: { value: 'F', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  passport_number: { value: 'EK790396', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  passport_expiration_date: { value: '2030-12-31', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  country_of_nationality: { value: 'UKR', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
  passport_country_of_issuance: { value: 'UKR', source: 'ocr_mrz', doc_slot: 'passport', confidence: 0.95 },
}
const I94_FIELDS: Record<string, ProvenanceInput> = {
  i94_admission_number: { value: '567890123B4', source: 'ocr_keyword', doc_slot: 'i94', confidence: 0.9 },
  i94_class_of_admission: { value: 'UH', source: 'ocr_keyword', doc_slot: 'i94', confidence: 0.9 },
  last_entry_date: { value: '2022-09-15', source: 'ocr_keyword', doc_slot: 'i94', confidence: 0.9 },
  family_name: { value: 'BONDARENKO', source: 'ocr_keyword', doc_slot: 'i94', confidence: 0.85 },
}
const EAD_FIELDS: Record<string, ProvenanceInput> = {
  a_number: { value: '234567890', source: 'ai_brain', doc_slot: 'ead', confidence: 0.85 },
  country_of_birth: { value: 'UKRAINE', source: 'ai_brain', doc_slot: 'ead', confidence: 0.85 },
}
const DL_FIELDS: Record<string, ProvenanceInput> = {
  us_address_street: { value: '456 TEST STREET', source: 'ocr_keyword', doc_slot: 'dl', confidence: 0.9 },
  us_address_city: { value: 'LOS ANGELES', source: 'ocr_keyword', doc_slot: 'dl', confidence: 0.9 },
  us_address_state: { value: 'CA', source: 'ocr_keyword', doc_slot: 'dl', confidence: 0.9 },
  us_address_zip: { value: '90028', source: 'ocr_keyword', doc_slot: 'dl', confidence: 0.9 },
}

function merge(...sources: Record<string, ProvenanceInput>[]): Record<string, ProvenanceInput> {
  const m: Record<string, ProvenanceInput> = {}
  for (const s of sources) for (const [k, v] of Object.entries(s)) if (!m[k]) m[k] = v
  return m
}

describe('E2E Pipeline Integration', () => {
  const merged = merge(PASSPORT_FIELDS, I94_FIELDS, EAD_FIELDS, DL_FIELDS)

  it('passport wins for identity in merge', () => {
    expect(merged.family_name.doc_slot).toBe('passport')
  })

  it('I-94 provides admission, EAD provides A-number, DL provides address', () => {
    expect(merged.i94_admission_number.doc_slot).toBe('i94')
    expect(merged.a_number.doc_slot).toBe('ead')
    expect(merged.us_address_street.doc_slot).toBe('dl')
  })

  it('provenance maps all sources correctly', () => {
    const prov = buildProvenanceFromWizard(merged, {}, Object.keys(merged))
    expect(prov.family_name.source_document_type).toBe('passport')
    expect(prov.family_name.extraction_method).toBe('ocr_mrz')
    expect(prov.i94_admission_number.source_document_type).toBe('i94')
    expect(prov.a_number.source_document_type).toBe('ead')
    expect(prov.us_address_street.source_document_type).toBe('driver_license')
  })

  it('user correction changes provenance to corrected', () => {
    const prov = buildProvenanceFromWizard(merged, { family_name: 'SMITH' }, Object.keys(merged))
    expect(prov.family_name.user_review_status).toBe('corrected')
  })

  it('DL cannot provide immigration provenance', () => {
    const bad = { a_number: { ...DL_FIELDS.us_address_street, doc_slot: 'dl' as const } }
    const prov = buildProvenanceFromWizard(bad, {}, ['a_number'])
    expect(prov.a_number.source_document_type).not.toBe('driver_license')
  })

  it('full pipeline generates valid ZIP with audit report', async () => {
    const v = (k: string) => merged[k]?.value || ''
    const answers: TPSAnswers = {
      family_name: v('family_name'), given_name: v('given_name'), middle_name: '',
      dob: v('dob'), sex: 'F', country_of_birth: v('country_of_birth') || 'Ukraine',
      country_of_nationality: 'Ukraine', passport_number: v('passport_number'),
      passport_country_of_issuance: 'Ukraine', passport_expiration_date: v('passport_expiration_date'),
      a_number: v('a_number'), i94_admission_number: v('i94_admission_number'),
      last_entry_date: v('last_entry_date'), status_at_last_entry: v('i94_class_of_admission') || 'UH',
      filing_path: 'initial', wants_ead: true, ead_category: 'c19',
      us_address_street: v('us_address_street'), us_address_city: v('us_address_city'),
      us_address_state: v('us_address_state'), us_address_zip: v('us_address_zip'),
      mailing_same_as_physical: true, daytime_phone: '2131234567',
      email: 'test@example.com', marital_status: 'single', ssn: '',
      part7_reviewed: true, has_criminal_concern: false,
      has_prior_tps_denial: false, left_us_without_advance_parole: false,
    }
    const keys = Object.keys(answers).filter(k => {
      const val = answers[k as keyof TPSAnswers]; return val !== undefined && val !== null && val !== ''
    })
    const provMap = buildProvenanceFromWizard(merged, {}, keys)
    const result = await buildPacket(answers, provMap)

    expect(result.zipBytes.length).toBeGreaterThan(100_000)
    expect(result.i821.applied).toBeGreaterThan(50)
    expect(result.auditSummary).not.toBeNull()

    const zip = await JSZip.loadAsync(result.zipBytes)
    expect(zip.file('I-821.pdf')).not.toBeNull()
    expect(zip.file('I-765.pdf')).not.toBeNull()
    expect(zip.file('INSTRUCTION.txt')).not.toBeNull()
    // AUDIT_PROVENANCE is internal-only — NOT in client package
    expect(zip.file('AUDIT_PROVENANCE.txt')).toBeNull()

    const instruction = await zip.file('INSTRUCTION.txt')!.async('string')
    expect(instruction).toContain('Messenginfo')
  })

  it('backward compat: packet without provenance works', async () => {
    const answers: TPSAnswers = {
      family_name: 'TEST', given_name: 'USER', middle_name: '',
      dob: '1990-01-01', sex: 'M', country_of_birth: 'Ukraine',
      country_of_nationality: 'Ukraine', passport_number: 'AB123456',
      passport_country_of_issuance: 'Ukraine', passport_expiration_date: '2030-01-01',
      a_number: '', i94_admission_number: '12345678901',
      last_entry_date: '2022-01-01', status_at_last_entry: 'UH',
      filing_path: 'initial', wants_ead: false, ead_category: 'c19',
      us_address_street: '123 ST', us_address_city: 'LA',
      us_address_state: 'CA', us_address_zip: '90001',
      mailing_same_as_physical: true, daytime_phone: '1234567890',
      email: 'x@x.com', marital_status: 'single', ssn: '',
      part7_reviewed: true, has_criminal_concern: false,
      has_prior_tps_denial: false, left_us_without_advance_parole: false,
    }
    const result = await buildPacket(answers, null)
    expect(result.zipBytes.length).toBeGreaterThan(0)
    expect(result.auditSummary).toBeNull()
    const zip = await JSZip.loadAsync(result.zipBytes)
    expect(zip.file('I-821.pdf')).not.toBeNull()
    expect(zip.file('I-765.pdf')).toBeNull()
    expect(zip.file('AUDIT_PROVENANCE.txt')).toBeNull()
  })
})
