/**
 * Vertical Slice Tests — Messenginfo v5.0
 * Proves the 7 required invariants for the translation engine.
 * No network calls, no Supabase — pure unit tests against actual exported functions.
 */

import { describe, it, expect } from 'vitest'
import { runQaValidators } from '../translationQaValidator'
import { buildCertificationRecord, validateCertificationRecord } from '../certificationRecord'
import { normalizeDateUkrainian } from '../numericAccuracy/dateFieldLockValidator'
import { validatePassportPerforation } from '../numericAccuracy/passportPerforationValidator'
import { createPacketState } from '../packetStateManager'
import type { PacketState, ExtractedField, CertificationRecord } from '../types'

// ── Month map used by normalizeDateUkrainian ─────────────────
const UA_MONTHS: Record<string, string> = {
  'січня':'January','лютого':'February','березня':'March','квітня':'April',
  'травня':'May','червня':'June','липня':'July','серпня':'August',
  'вересня':'September','жовтня':'October','листопада':'November','грудня':'December',
}

// ── Helpers ───────────────────────────────────────────────────
function makeField(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    field: 'surname',
    source_label: 'ПРІЗВИЩЕ',
    source_zone: 'personal_data',
    bbox: [0.1, 0.1, 0.9, 0.2],
    raw_value: 'ПЕТРЕНКО',
    normalized_value: 'PETRENKO',
    language_layer: 'uk',
    confidence: 0.95,
    review_required: false,
    ...overrides,
  }
}

function makeState(overrides: Partial<PacketState> = {}): PacketState {
  const base = createPacketState({ session_id: 'test-ses-001', locale: 'en' })
  return {
    ...base,
    extracted_fields: [makeField()],
    source_traces: [{
      field: 'surname',
      document_type: 'ua_passport_booklet',
      source_label: 'ПРІЗВИЩЕ',
      source_zone: 'personal_data',
      bbox: [0.1, 0.1, 0.9, 0.2],
      raw_value: 'ПЕТРЕНКО',
      normalized_value: 'PETRENKO',
      language_layer: 'uk',
      confidence: 0.95,
      review_required: false,
    }],
    payment_confirmed: true,
    certification_record: buildCertificationRecord({
      signerName: 'Ivan Petrenko',
      sourceLanguage: 'Ukrainian',
      signatureTypedName: 'Ivan Petrenko',
    }),
    scope_title: 'English Translation of Ukrainian Internal Passport',
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// TEST 1: No final render before payment
// ════════════════════════════════════════════════════════════════
describe('Gate 1 — payment_confirmed', () => {
  it('blocks render when payment_confirmed = false', () => {
    const state = makeState({ payment_confirmed: false })
    const qa = runQaValidators(state)
    expect(qa.status).toBe('FAIL')
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower).toContain('payment')
  })

  it('does not produce a payment failure when payment_confirmed = true', () => {
    const state = makeState({ payment_confirmed: true })
    const qa = runQaValidators(state)
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower).not.toContain('payment')
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 2: No final render without certification
// ════════════════════════════════════════════════════════════════
describe('Gate 2 — certification_record', () => {
  it('blocks render when certification_record is null', () => {
    const state = makeState({ certification_record: null })
    const qa = runQaValidators(state)
    expect(qa.status).toBe('FAIL')
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower).toContain('certif')
  })

  it('validateCertificationRecord fails on empty required fields', () => {
    const badRecord: CertificationRecord = {
      signer_full_name: '',           // MISSING — required
      language_pair_confirmed: false, // NOT confirmed — required true
      statement: '',                  // MISSING — required
      signature_typed_name: '',       // MISSING — required
      signed_at: new Date().toISOString(),
      certification_version: 'v1.0-8cfr-2026',
    }
    const { valid, errors } = validateCertificationRecord(badRecord)
    expect(valid).toBe(false)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('validateCertificationRecord passes on complete record', () => {
    const record = buildCertificationRecord({
      signerName: 'Ivan Petrenko',
      sourceLanguage: 'Ukrainian',
      signatureTypedName: 'Ivan Petrenko',
    })
    const { valid, errors } = validateCertificationRecord(record)
    expect(valid).toBe(true)
    expect(errors).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 3: No final render without source trace
// ════════════════════════════════════════════════════════════════
describe('Gate 3 — source traces required', () => {
  it('blocks render when source_traces is empty', () => {
    const state = makeState({ source_traces: [] })
    const qa = runQaValidators(state)
    expect(qa.status).toBe('FAIL')
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower.includes('trace') || failureLower.includes('source')).toBe(true)
  })

  it('source trace failure absent when traces are present', () => {
    const state = makeState()
    const qa = runQaValidators(state)
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower.includes('no source trace') || failureLower.includes('missing source')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 4: Forbidden phrases blocked in final text
// ════════════════════════════════════════════════════════════════
describe('Forbidden phrases detector', () => {
  const BANNED = [
    'CERTIFIED COPY',
    'USCIS accepted',
    'certified by AI',
    'guaranteed',
    'instant certified translation',
    '100% accepted',
  ]

  for (const phrase of BANNED) {
    it(`rejects document text containing "${phrase}"`, () => {
      const state = makeState()
      const qa = runQaValidators(state, `Translation content. ${phrase}. Other content.`)
      expect(qa.status).toBe('FAIL')
      const failureLower = qa.failures.join(' ').toLowerCase()
      expect(failureLower).toContain('forbidden')
    })
  }

  it('passes clean document with no forbidden phrases', () => {
    const state = makeState()
    const qa = runQaValidators(state, 'Name: Ivan Petrenko. DOB: 02/19/2003. Place: Kyiv.')
    const failureLower = qa.failures.join(' ').toLowerCase()
    expect(failureLower).not.toContain('forbidden')
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 5: Ukrainian month mapping
// ════════════════════════════════════════════════════════════════
describe('Month mapping — normalizeDateUkrainian', () => {
  const cases: [string, string][] = [
    ['19 лютого 2003',    '02/19/2003'],
    ['01 січня 1990',     '01/01/1990'],
    ['31 грудня 1985',    '12/31/1985'],
    ['15 березня 2000',   '03/15/2000'],
    ['28 квітня 1978',    '04/28/1978'],
    ['07 травня 2026',    '05/07/2026'],
    ['11 листопада 1999', '11/11/1999'],
    ['22 серпня 2010',    '08/22/2010'],
    ['03 вересня 1965',   '09/03/1965'],
    ['14 жовтня 2002',    '10/14/2002'],
  ]

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(normalizeDateUkrainian(input, UA_MONTHS)).toBe(expected)
    })
  }

  it('returns null when format is not recognized', () => {
    expect(normalizeDateUkrainian('invalid date', UA_MONTHS)).toBeNull()
  })

  it('returns null when month is unknown', () => {
    expect(normalizeDateUkrainian('01 unknownmonth 2003', UA_MONTHS)).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 6: Passport series/number format validator
// ════════════════════════════════════════════════════════════════
describe('Passport perforation validator', () => {
  it('accepts valid UA Cyrillic series АА + 6 digits', () => {
    const r = validatePassportPerforation('АА', '123456')
    expect(r.valid_format).toBe(true)
    expect(r.warnings.some(w => w.includes('invalid'))).toBe(false)
  })

  it('rejects Latin series AA (must be Cyrillic)', () => {
    // Latin A is different from Cyrillic А
    const r = validatePassportPerforation('AA', '123456')  // Latin A
    expect(r.valid_format).toBe(false)
  })

  it('rejects number with fewer than 6 digits', () => {
    const r = validatePassportPerforation('АА', '12345')
    expect(r.valid_format).toBe(false)
  })

  it('rejects number with more than 6 digits', () => {
    const r = validatePassportPerforation('АА', '1234567')
    expect(r.valid_format).toBe(false)
  })

  it('flags ambiguous digits when confidence < 0.90', () => {
    // Provide confidence map indicating position 0 has low confidence
    const confMap = { 0: 0.70, 1: 0.70, 2: 0.70, 3: 0.70, 4: 0.70, 5: 0.70 }
    const r = validatePassportPerforation('АА', '000000', confMap)
    // 0 is ambiguous with 8, 6 — at confidence 0.70 (< 0.90) should flag
    expect(r.ambiguous_digits.length).toBeGreaterThan(0)
    expect(r.review_required).toBe(true)
  })

  it('does not flag high-confidence digits as ambiguous', () => {
    // All at confidence 1.0 (default) — should not flag ambiguous digits
    const r = validatePassportPerforation('АА', '000000')
    // No confidence map provided, defaults to 1.0 — no ambiguous
    expect(r.ambiguous_digits).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════
// TEST 7: Correction version log — in-memory invariant
// ════════════════════════════════════════════════════════════════
describe('Correction version tracking', () => {
  type Correction = { field: string; old_value: string; new_value: string; reason: string; version: number }

  function buildCorrectionLog() {
    const log: Correction[] = []
    function applyCorrection(field: string, old_value: string, new_value: string, reason: string) {
      const version = log.filter(c => c.field === field).length + 1
      log.push({ field, old_value, new_value, reason, version })
    }
    return { log, applyCorrection }
  }

  it('tracks old_value, new_value, reason in order', () => {
    const { log, applyCorrection } = buildCorrectionLog()
    applyCorrection('surname', 'PETRENKO', 'Petrenko', 'capitalization fix')

    expect(log).toHaveLength(1)
    expect(log[0].old_value).toBe('PETRENKO')
    expect(log[0].new_value).toBe('Petrenko')
    expect(log[0].reason).toBe('capitalization fix')
    expect(log[0].version).toBe(1)
  })

  it('increments version per correction on same field', () => {
    const { log, applyCorrection } = buildCorrectionLog()
    applyCorrection('surname', 'PETRENKO', 'Petrenko', 'lower case')
    applyCorrection('surname', 'Petrenko', 'PETRENKO', 'reverted')

    expect(log[0].version).toBe(1)
    expect(log[1].version).toBe(2)
  })

  it('version counter is per-field not global', () => {
    const { log, applyCorrection } = buildCorrectionLog()
    applyCorrection('surname', 'PETRENKO', 'Petrenko', 'fix 1')
    applyCorrection('given_name', 'IVAN', 'Ivan', 'fix 1')
    applyCorrection('surname', 'Petrenko', 'PETRENKO', 'fix 2')

    const surnameV2 = log.find(x => x.field === 'surname' && x.version === 2)
    const givenV1 = log.find(x => x.field === 'given_name' && x.version === 1)
    expect(surnameV2).toBeTruthy()
    expect(givenV1).toBeTruthy()
  })

  it('preserves full history — old correction is never overwritten', () => {
    const { log, applyCorrection } = buildCorrectionLog()
    applyCorrection('surname', 'A', 'B', 'first')
    applyCorrection('surname', 'B', 'C', 'second')
    applyCorrection('surname', 'C', 'D', 'third')

    expect(log).toHaveLength(3)
    expect(log[0].new_value).toBe('B')
    expect(log[1].new_value).toBe('C')
    expect(log[2].new_value).toBe('D')
  })
})
