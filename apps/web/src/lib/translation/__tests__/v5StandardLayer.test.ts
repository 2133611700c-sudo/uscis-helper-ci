/**
 * v5 Standard Layer — coverage for newly added validators / extractors /
 * audit helpers / passport booklet customer template.
 *
 *   sourceTraceValidator        (v5 §27)
 *   paymentGateValidator        (v5 §21)
 *   certificationRecordValidator (v5 §18 / §36)
 *   sourceToFinalAudit          (v5 §23)
 *   correctionClassifier        (v5 §22)
 *   zoneExtractor               (v5 §9)
 *   numericAccuracy/monthMapValidator       (v5 §11)
 *   numericAccuracy/digitShapeComparator    (v5 §12)
 *   templates/passportBooklet.template      (UKRAINE_PASSPORT_BOOKLET_RULES)
 */

import { describe, it, expect } from 'vitest'

import { validateMonthToken, parseUkrainianDate } from '../numericAccuracy/monthMapValidator'
import {
  compareDigitShapes,
  comparePassportPerforation,
} from '../numericAccuracy/digitShapeComparator'
import { validateSourceTrace } from '../sourceTraceValidator'
import { validatePaymentGate } from '../paymentGateValidator'
import {
  gateCertificationRecord,
  CERTIFICATION_VERSION,
} from '../certificationRecordValidator'
import { auditSourceToFinal } from '../sourceToFinalAudit'
import {
  classifyCorrection,
  stampCorrectionClass,
} from '../correctionClassifier'
import {
  validateSourceZone,
  getZonesForDocument,
  CANONICAL_ZONES,
} from '../zoneExtractor'
import { renderPassportBooklet } from '../templates/passportBooklet.template'

import type { ExtractedField, PacketState, SourceTrace, CertificationRecord } from '../types'

// ── monthMapValidator ────────────────────────────────────────────────────────

describe('validateMonthToken', () => {
  it('resolves Ukrainian genitive months', () => {
    expect(validateMonthToken('лютого')).toMatchObject({
      valid: true, monthName: 'February', monthIndex: 2, source: 'uk',
    })
    expect(validateMonthToken('травня').monthName).toBe('May')
    expect(validateMonthToken('грудня').monthIndex).toBe(12)
  })
  it('resolves Russian genitive months', () => {
    expect(validateMonthToken('февраля')).toMatchObject({
      valid: true, monthName: 'February', monthIndex: 2, source: 'ru',
    })
    expect(validateMonthToken('декабря').monthIndex).toBe(12)
  })
  it('accepts canonical English month names case-insensitively', () => {
    expect(validateMonthToken('May').monthIndex).toBe(5)
    expect(validateMonthToken('MAY').source).toBe('en')
  })
  it('rejects unknown tokens', () => {
    const r = validateMonthToken('xyzmonth')
    expect(r.valid).toBe(false)
    expect(r.monthIndex).toBe(0)
    expect(r.source).toBe('unknown')
  })
})

describe('parseUkrainianDate', () => {
  it('parses "19 лютого 2003"', () => {
    expect(parseUkrainianDate('19 лютого 2003')).toEqual({
      day: 19, monthIndex: 2, year: 2003, monthName: 'February', source: 'uk',
    })
  })
  it('parses with trailing "р." (рік)', () => {
    expect(parseUkrainianDate('19 лютого 2003 р.')).toMatchObject({
      day: 19, monthIndex: 2, year: 2003,
    })
  })
  it('parses Russian variant', () => {
    expect(parseUkrainianDate('19 февраля 2003')).toMatchObject({
      day: 19, year: 2003, monthName: 'February',
    })
  })
  it('returns null on garbage', () => {
    expect(parseUkrainianDate('not a date')).toBeNull()
    expect(parseUkrainianDate('99 фуфло 2003')).toBeNull()
  })
  it('rejects out-of-range day or year', () => {
    expect(parseUkrainianDate('99 травня 2003')).toBeNull()
    expect(parseUkrainianDate('1 травня 1799')).toBeNull()
  })
})

// ── digitShapeComparator ─────────────────────────────────────────────────────

describe('compareDigitShapes', () => {
  it('passes for an unambiguous sequence with high confidence', () => {
    // Chars must avoid ALL ambiguity rules: no 0/O, no 1/I/l, no 6/9,
    // no 4/A, no 2/Z. So we use letters/digits OUTSIDE the rule set:
    // 'C', 'D', '5' (with conf > 0.92), '7' (with conf > 0.95),
    // '3' (with conf > 0.92), '8' (with conf > 0.92).
    const r = compareDigitShapes('CDX573', [1, 1, 1, 1, 1, 1])
    expect(r.suspects.length).toBe(0)
    expect(r.ok).toBe(true)
    expect(r.review_required).toBe(false)
  })
  it('always flags 6↔9 regardless of confidence', () => {
    const r = compareDigitShapes('ABC9DEF', [1, 1, 1, 1.0, 1, 1, 1])
    expect(r.suspects.some(s => s.position === 3 && s.candidates.includes('6'))).toBe(true)
    expect(r.flaggedPairs).toContain('6<->9')
  })
  it('flags 3↔8 only below threshold 0.92', () => {
    const high = compareDigitShapes('AB78', [1, 1, 0.95, 0.95])
    // '8' has B↔8 ambiguity rule with threshold 0.92 — at conf 0.95 it should NOT fire
    expect(high.suspects.find(s => s.character === '8' && s.candidates.includes('B'))).toBeUndefined()
    const low = compareDigitShapes('AB78', [1, 1, 0.5, 0.5])
    expect(low.suspects.length).toBeGreaterThan(0)
  })
  it('comparePassportPerforation defaults conf=1.0 and only fires "always"-rules', () => {
    const r = comparePassportPerforation('СО478123')
    // '1' is always ambiguous (1↔I, 1↔l). '4' always (4↔A). '2' always (2↔Z).
    expect(r.flaggedPairs.some(p => p.startsWith('1<->'))).toBe(true)
    expect(r.review_required).toBe(true)
  })
})

// ── sourceTraceValidator ─────────────────────────────────────────────────────

function mkPacket(over: Partial<PacketState> = {}): PacketState {
  const base: PacketState = {
    session_id: 's1',
    status: 'created',
    // 'ua_passport_booklet' is the DocumentType-union value; the
    // alias-aware resolver maps it to the canonical
    // 'ua_internal_passport_booklet' module.
    document_type: 'ua_passport_booklet',
    controlling_spelling: {},
    uploaded_pages: 1,
    total_pages_declared: 1,
    extracted_fields: [],
    source_traces: [],
    user_corrections: [],
    certification_record: null,
    payment_confirmed: false,
    payment_checkout_id: null,
    qa_result: null,
    scope_title: 'English Translation of Ukrainian Internal Passport (Booklet)',
    locale: 'en',
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-09T00:00:00Z',
  }
  return { ...base, ...over }
}

function mkTrace(field: string, value: string, conf = 1.0): SourceTrace {
  return {
    field,
    document_type: 'ua_passport_booklet',
    source_label: `label-${field}`,
    source_zone: 'personal_data',
    bbox: [0, 0, 1, 1],
    raw_value: value,
    normalized_value: value,
    language_layer: 'uk',
    confidence: conf,
    review_required: false,
  }
}

function mkField(field: string, value: string): ExtractedField {
  return {
    field,
    source_label: `label-${field}`,
    source_zone: 'personal_data',
    bbox: [0, 0, 1, 1],
    raw_value: value,
    normalized_value: value,
    language_layer: 'uk',
    confidence: 1.0,
    review_required: false,
  }
}

describe('validateSourceTrace', () => {
  it('passes when every critical field has a complete trace', () => {
    // Use the actual passport booklet module's critical-field keys:
    // document_type, series, number, surname, given_names, patronymic,
    // date_of_birth, place_of_birth, sex, issued_by, date_of_issue
    const packet = mkPacket({
      source_traces: [
        mkTrace('document_type', 'Ukrainian Internal Passport (Booklet)'),
        mkTrace('series', 'СО'),
        mkTrace('number', '478123'),
        mkTrace('surname', 'SHEVCHENKO'),
        mkTrace('given_names', 'TARAS'),
        mkTrace('patronymic', 'HRYHOROVYCH'),
        mkTrace('date_of_birth', '12 May 1990'),
        mkTrace('place_of_birth', 'KYIV'),
        mkTrace('sex', 'M'),
        mkTrace('issued_by', 'KYIV MIA'),
        mkTrace('date_of_issue', '19 February 2003'),
      ],
      extracted_fields: [
        mkField('document_type', 'Ukrainian Internal Passport (Booklet)'),
        mkField('series', 'СО'),
        mkField('number', '478123'),
        mkField('surname', 'SHEVCHENKO'),
        mkField('given_names', 'TARAS'),
        mkField('patronymic', 'HRYHOROVYCH'),
        mkField('date_of_birth', '12 May 1990'),
        mkField('place_of_birth', 'KYIV'),
        mkField('sex', 'M'),
        mkField('issued_by', 'KYIV MIA'),
        mkField('date_of_issue', '19 February 2003'),
      ],
    })
    const r = validateSourceTrace(packet)
    expect(r.ok).toBe(true)
    expect(r.missing).toHaveLength(0)
  })

  it('reports missing critical traces', () => {
    const packet = mkPacket({ source_traces: [], extracted_fields: [] })
    const r = validateSourceTrace(packet)
    expect(r.ok).toBe(false)
    expect(r.missing.length).toBeGreaterThan(0)
    expect(r.review_required).toBe(true)
  })

  it('reports low_confidence traces', () => {
    const packet = mkPacket({
      source_traces: [mkTrace('surname', 'X', 0.5)],
      extracted_fields: [mkField('surname', 'X')],
    })
    const r = validateSourceTrace(packet)
    expect(r.low_confidence.find(x => x.field === 'surname')).toBeDefined()
    expect(r.ok).toBe(false)
  })

  it('reports value mismatch between trace and draft field', () => {
    const packet = mkPacket({
      source_traces: [mkTrace('surname', 'SHEVCHENKO')],
      extracted_fields: [mkField('surname', 'shevchenko')],
    })
    const r = validateSourceTrace(packet)
    expect(r.mismatched_value.length).toBeGreaterThan(0)
  })

  it('skips silently for unknown / manual-review document types', () => {
    // 'other' resolves through the alias-aware resolver to the manual
    // review fallback. The validator's contract: skip (ok=true) when
    // there's no active module to validate against.
    const packet = mkPacket({ document_type: 'other' })
    const r = validateSourceTrace(packet)
    expect(r.ok).toBe(true)
    expect(r.passes[0]).toMatch(/skipped/)
  })
})

// ── paymentGateValidator ─────────────────────────────────────────────────────

describe('validatePaymentGate', () => {
  it('rejects when payment_confirmed=false', () => {
    const r = validatePaymentGate(mkPacket({ payment_confirmed: false }))
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('payment_not_confirmed')
  })
  it('rejects when checkout id is missing', () => {
    const r = validatePaymentGate(
      mkPacket({ payment_confirmed: true, payment_checkout_id: null }),
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('checkout_id_missing')
  })
  it('rejects unknown checkout id shape', () => {
    const r = validatePaymentGate(
      mkPacket({ payment_confirmed: true, payment_checkout_id: 'whatever' }),
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('invalid_checkout_id_shape')
  })
  it('rejects sandbox id in production mode', () => {
    const r = validatePaymentGate(
      mkPacket({ payment_confirmed: true, payment_checkout_id: 'cs_test_abc' }),
      { mode: 'production' },
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('sandbox_id_in_production_mode')
  })
  it('accepts cs_live_ in production', () => {
    const r = validatePaymentGate(
      mkPacket({ payment_confirmed: true, payment_checkout_id: 'cs_live_abc' }),
    )
    expect(r.ok).toBe(true)
  })
  it('accepts pilot_ checkout id', () => {
    const r = validatePaymentGate(
      mkPacket({ payment_confirmed: true, payment_checkout_id: 'pilot_p001' }),
    )
    expect(r.ok).toBe(true)
  })
})

// ── certificationRecordValidator ─────────────────────────────────────────────

describe('gateCertificationRecord', () => {
  function mkCert(over: Partial<CertificationRecord> = {}): CertificationRecord {
    return {
      signer_full_name: 'Ivan Test',
      language_pair_confirmed: true,
      // The underlying validator requires the statement to reference 8 CFR §103.2(b)(3).
      statement:
        'I certify that I am competent to translate. Pursuant to 8 CFR §103.2(b)(3).',
      // signature_typed_name MUST equal signer_full_name (case-insensitively).
      signature_typed_name: 'Ivan Test',
      signed_at: '2026-05-09T00:00:00Z',
      certification_version: CERTIFICATION_VERSION,
      ...over,
    }
  }
  it('accepts a current, complete record', () => {
    const r = gateCertificationRecord(mkCert())
    expect(r.ok).toBe(true)
    expect(r.version_current).toBe(true)
  })
  it('rejects null record', () => {
    const r = gateCertificationRecord(null)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/missing/i)
  })
  it('rejects stale certification_version', () => {
    const r = gateCertificationRecord(mkCert({ certification_version: 'v0.0-old' }))
    expect(r.ok).toBe(false)
    expect(r.version_current).toBe(false)
    expect(r.errors.some(e => /stale/i.test(e))).toBe(true)
  })
})

// ── sourceToFinalAudit ───────────────────────────────────────────────────────

describe('auditSourceToFinal', () => {
  it('flags missing critical confirmed fields', () => {
    const r = auditSourceToFinal({
      packet: mkPacket(),
      finalRenderedText: 'CERTIFIED ENGLISH TRANSLATION\nUKRAINIAN INTERNAL PASSPORT (BOOKLET)',
      attachedOriginalPageCount: 1,
    })
    expect(r.ok).toBe(false)
    expect(r.findings.some(f => f.type === 'critical_field_missing_in_draft')).toBe(true)
  })
  it('flags scope broader than uploaded pages', () => {
    const packet = mkPacket({
      uploaded_pages: 1,
      total_pages_declared: 16,
      scope_title: 'English Translation of the Provided Pages (pages 1-5 of 16)',
    })
    const r = auditSourceToFinal({
      packet,
      finalRenderedText: 'something',
      attachedOriginalPageCount: 1,
    })
    expect(r.findings.some(f => f.type === 'scope_broader_than_pages')).toBe(true)
  })
  it('flags no original pages attached', () => {
    const r = auditSourceToFinal({
      packet: mkPacket(),
      finalRenderedText: 'something',
      attachedOriginalPageCount: 0,
    })
    expect(r.findings.some(f => f.type === 'no_original_pages_attached')).toBe(true)
  })
})

// ── correctionClassifier ─────────────────────────────────────────────────────

describe('classifyCorrection', () => {
  it('classifies Latin name on Cyrillic source as controlling_spelling', () => {
    const d = classifyCorrection({
      field: 'surname',
      raw_value: 'Шевченко',
      user_value: 'SHEVCHENKO',
    })
    expect(d.classification).toBe('controlling_spelling')
    expect(d.persist_to_translation_memory).toBe(true)
    expect(d.update_packet_anchor).toBe(true)
  })
  it('classifies small same-script edit as ocr_error', () => {
    const d = classifyCorrection({
      field: 'surname',
      raw_value: 'Шевченко',
      user_value: 'Шевченков',  // 1-char insertion
    })
    expect(d.classification).toBe('ocr_error')
    expect(d.persist_to_translation_memory).toBe(false)
  })
  it('classifies large different-script swap as one_document_exception', () => {
    const d = classifyCorrection({
      field: 'place_of_birth',
      raw_value: 'Київ',
      user_value: 'a totally different value not Latin not close',
    })
    expect(d.classification).toBe('one_document_exception')
    expect(d.persist_to_translation_memory).toBe(false)
    expect(d.update_packet_anchor).toBe(false)
  })
  it('honours user-declared override', () => {
    // Heuristic for a 1-char same-script edit returns 'ocr_error',
    // but the user explicitly says it's a controlling_spelling.
    // The override wins; heuristic_agreed must be false.
    const d = classifyCorrection({
      field: 'surname',
      raw_value: 'Шевченко',
      user_value: 'Шевченков',
      user_declared_class: 'controlling_spelling',
    })
    expect(d.classification).toBe('controlling_spelling')
    expect(d.heuristic_classification).toBe('ocr_error')
    expect(d.heuristic_agreed).toBe(false)
  })
  it('stampCorrectionClass returns a new field with classification stamped', () => {
    const f = mkField('surname', 'SHEVCHENKO')
    const stamped = stampCorrectionClass(f, 'Шевченко')
    expect(stamped.user_corrected).toBe(true)
    expect(stamped.correction_class).toBe('controlling_spelling')
    // Original field is not mutated.
    expect(f.user_corrected).toBeUndefined()
  })
})

// ── zoneExtractor ────────────────────────────────────────────────────────────

describe('zoneExtractor', () => {
  it('CANONICAL_ZONES contains a known zone', () => {
    expect(CANONICAL_ZONES.includes('personal_data')).toBe(true)
    expect(CANONICAL_ZONES.includes('act_record_block')).toBe(true)
  })
  it('validateSourceZone accepts a passport-booklet zone', () => {
    const r = validateSourceZone('personal_data', 'ua_internal_passport_booklet')
    expect(r.ok).toBe(true)
  })
  it('validateSourceZone rejects birth-cert zone for passport booklet', () => {
    const r = validateSourceZone('act_record_block', 'ua_internal_passport_booklet')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('not_allowed_for_document')
  })
  it('validateSourceZone rejects non-canonical zone names', () => {
    const r = validateSourceZone('garbage_zone_xyz', 'ua_internal_passport_booklet')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('not_canonical')
  })
  it('getZonesForDocument returns the table for a known doctype', () => {
    const zones = getZonesForDocument('ua_birth_certificate')
    expect(zones).toContain('act_record_block')
    expect(zones).toContain('child_block')
  })
})

// ── passportBooklet.template ─────────────────────────────────────────────────

describe('renderPassportBooklet', () => {
  function mkRenderField(field: string, value: string) {
    return {
      field,
      label: '',
      value,
      confirmed: true,
    }
  }

  it('renders every populated field in canonical order', () => {
    const out = renderPassportBooklet({
      session_id: 's-render-1',
      fields: [
        mkRenderField('surname', 'SHEVCHENKO'),
        mkRenderField('given_name', 'TARAS'),
        mkRenderField('date_of_birth', '12 May 1990'),
      ],
      translation_date: '12 May 2026',
      signer_full_name: 'Ivan Test',
      signer_address: '123 Main St, San Francisco CA',
      source_language: 'Ukrainian/Russian',
    })
    expect(out.title).toContain('CERTIFIED ENGLISH TRANSLATION')
    expect(out.field_lines).toContain('Surname: SHEVCHENKO')
    expect(out.field_lines).toContain('Given Name: TARAS')
    expect(out.field_lines).toContain('Date of Birth: 12 May 1990')
    expect(out.certification_block.join('\n')).toMatch(/8 CFR §103.2\(b\)\(3\)/)
    expect(out.forbidden_phrase_violations).toEqual([])
  })

  it('detects forbidden phrase if a value tries to inject "Middle Name"', () => {
    const out = renderPassportBooklet({
      session_id: 's-render-2',
      fields: [
        // Defensive: even if a malicious upstream emits this label, scanner must catch it.
        { field: 'patronymic', label: 'Patronymic', value: 'HRYHOROVYCH (Middle Name)', confirmed: true },
      ],
      translation_date: '12 May 2026',
      signer_full_name: 'X',
      signer_address: 'Y',
    })
    expect(out.forbidden_phrase_violations.length).toBeGreaterThan(0)
  })

  it('never includes "source trace", "bbox", "ocr_id" in customer output', () => {
    const out = renderPassportBooklet({
      session_id: 's-render-3',
      fields: [mkRenderField('surname', 'SHEVCHENKO')],
      translation_date: '12 May 2026',
      signer_full_name: 'X',
      signer_address: 'Y',
    })
    const all = [out.title, ...out.field_lines, ...out.certification_block].join('\n')
    expect(all).not.toMatch(/source trace|bbox|ocr_id/i)
  })
})
