/**
 * Passport Booklet Module Tests
 *
 * Verifies the module's field definitions, validators, review policy,
 * and exported convenience constants.
 */
import { describe, it, expect } from 'vitest'
import {
  passportBookletModule,
  PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS,
  PASSPORT_BOOKLET_GATE_FIELDS,
} from '../passportBooklet.module'

// ── Basic structure ───────────────────────────────────────────────────────────

describe('passportBookletModule structure', () => {
  it('has the correct documentType', () => {
    expect(passportBookletModule.documentType).toBe('ua_internal_passport_booklet')
  })

  it('has status active', () => {
    expect(passportBookletModule.status).toBe('active')
  })

  it('supports uk and ru languages', () => {
    expect(passportBookletModule.supportedLanguages).toContain('uk')
    expect(passportBookletModule.supportedLanguages).toContain('ru')
  })

  it('has displayName in en, ru, uk', () => {
    expect(passportBookletModule.displayName.en).toBeTruthy()
    expect(passportBookletModule.displayName.ru).toBeTruthy()
    expect(passportBookletModule.displayName.uk).toBeTruthy()
  })
})

// ── Critical fields ───────────────────────────────────────────────────────────

describe('passportBookletModule criticalFields', () => {
  it('has exactly 11 critical fields', () => {
    expect(passportBookletModule.criticalFields.length).toBe(11)
  })

  it('contains all 11 expected field keys', () => {
    const keys = passportBookletModule.criticalFields.map(f => f.key)
    const expected = [
      'document_type', 'series', 'number', 'surname', 'given_names',
      'patronymic', 'date_of_birth', 'place_of_birth', 'sex',
      'issued_by', 'date_of_issue',
    ]
    for (const k of expected) {
      expect(keys).toContain(k)
    }
  })

  it('has no duplicate critical field keys', () => {
    const keys = passportBookletModule.criticalFields.map(f => f.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('all critical fields have reviewRequired = true', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(f.reviewRequired).toBe(true)
    }
  })

  it('all critical fields have fallbackIfMissing = review_required', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(f.fallbackIfMissing).toBe('review_required')
    }
  })

  it('all critical fields have required = true', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(f.required).toBe(true)
    }
  })

  it('all critical fields have evidenceRequired of required or preferred (not optional)', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(['required', 'preferred']).toContain(f.evidenceRequired)
    }
  })

  it('patronymic has evidenceRequired = preferred (not required)', () => {
    const patronymic = passportBookletModule.criticalFields.find(f => f.key === 'patronymic')
    expect(patronymic?.evidenceRequired).toBe('preferred')
  })

  it('all other critical fields have evidenceRequired = required', () => {
    const nonPatronymic = passportBookletModule.criticalFields.filter(f => f.key !== 'patronymic')
    for (const f of nonPatronymic) {
      expect(f.evidenceRequired).toBe('required')
    }
  })

  it('each critical field has a label in en, ru, uk', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(f.label.en).toBeTruthy()
      expect(f.label.ru).toBeTruthy()
      expect(f.label.uk).toBeTruthy()
    }
  })

  it('each critical field has a non-empty sourceLabels array', () => {
    for (const f of passportBookletModule.criticalFields) {
      expect(f.sourceLabels.length).toBeGreaterThan(0)
    }
  })
})

// ── Optional fields ───────────────────────────────────────────────────────────

describe('passportBookletModule optionalFields', () => {
  it('has at least 3 optional fields', () => {
    expect(passportBookletModule.optionalFields.length).toBeGreaterThanOrEqual(3)
  })

  it('includes nationality, date_of_expiry, record_number', () => {
    const keys = passportBookletModule.optionalFields.map(f => f.key)
    expect(keys).toContain('nationality')
    expect(keys).toContain('date_of_expiry')
    expect(keys).toContain('record_number')
  })

  it('all optional fields have required = false', () => {
    for (const f of passportBookletModule.optionalFields) {
      expect(f.required).toBe(false)
    }
  })

  it('all optional fields have evidenceRequired = optional', () => {
    for (const f of passportBookletModule.optionalFields) {
      expect(f.evidenceRequired).toBe('optional')
    }
  })

  it('all optional fields have fallbackIfMissing = skip', () => {
    for (const f of passportBookletModule.optionalFields) {
      expect(f.fallbackIfMissing).toBe('skip')
    }
  })
})

// ── Validators ────────────────────────────────────────────────────────────────

describe('passportBookletModule validators', () => {
  it('includes passport_series_format', () => {
    expect(passportBookletModule.validators).toContain('passport_series_format')
  })

  it('includes passport_number_format', () => {
    expect(passportBookletModule.validators).toContain('passport_number_format')
  })

  it('includes date_of_birth_lock', () => {
    expect(passportBookletModule.validators).toContain('date_of_birth_lock')
  })

  it('includes date_of_issue_lock', () => {
    expect(passportBookletModule.validators).toContain('date_of_issue_lock')
  })

  it('includes month_map_uk_ru', () => {
    expect(passportBookletModule.validators).toContain('month_map_uk_ru')
  })

  it('includes name_mixed_script', () => {
    expect(passportBookletModule.validators).toContain('name_mixed_script')
  })

  it('includes agency_glossary', () => {
    expect(passportBookletModule.validators).toContain('agency_glossary')
  })

  it('includes date_zone_cross_check', () => {
    expect(passportBookletModule.validators).toContain('date_zone_cross_check')
  })

  it('includes bilingual_layer', () => {
    expect(passportBookletModule.validators).toContain('bilingual_layer')
  })

  it('includes source_evidence_required', () => {
    expect(passportBookletModule.validators).toContain('source_evidence_required')
  })
})

// ── Review policy ─────────────────────────────────────────────────────────────

describe('passportBookletModule reviewPolicy', () => {
  it('has allowAutoPdf = true (after gates pass)', () => {
    expect(passportBookletModule.reviewPolicy.allowAutoPdf).toBe(true)
  })

  it('has requireUserConfirmation = true', () => {
    expect(passportBookletModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('has requireEvidenceForCriticalFields = true', () => {
    expect(passportBookletModule.reviewPolicy.requireEvidenceForCriticalFields).toBe(true)
  })

  it('has manualReviewIfMissingCritical = true', () => {
    expect(passportBookletModule.reviewPolicy.manualReviewIfMissingCritical).toBe(true)
  })

  it('has manualReviewIfLowConfidence = true', () => {
    expect(passportBookletModule.reviewPolicy.manualReviewIfLowConfidence).toBe(true)
  })

  it('has lowConfidenceThreshold = 0.65', () => {
    expect(passportBookletModule.reviewPolicy.lowConfidenceThreshold).toBe(0.65)
  })
})

// ── Extraction config ─────────────────────────────────────────────────────────

describe('passportBookletModule extraction', () => {
  it('uses google_vision as OCR provider', () => {
    expect(passportBookletModule.extraction.ocrProvider).toBe('google_vision')
  })

  it('uses deepseek_text as field mapper', () => {
    expect(passportBookletModule.extraction.fieldMapper).toBe('deepseek_text')
  })

  it('targets all 11 critical fields', () => {
    const criticalKeys = passportBookletModule.criticalFields.map(f => f.key)
    for (const k of criticalKeys) {
      expect(passportBookletModule.extraction.fieldTargets).toContain(k)
    }
  })

  it('targets 3 optional fields (nationality, date_of_expiry, record_number)', () => {
    expect(passportBookletModule.extraction.fieldTargets).toContain('nationality')
    expect(passportBookletModule.extraction.fieldTargets).toContain('date_of_expiry')
    expect(passportBookletModule.extraction.fieldTargets).toContain('record_number')
  })

  it('has a timeout of 45000ms', () => {
    expect(passportBookletModule.extraction.timeoutMs).toBe(45_000)
  })
})

// ── Render config ─────────────────────────────────────────────────────────────

describe('passportBookletModule render', () => {
  it('has a non-empty templateId', () => {
    expect(passportBookletModule.render.templateId).toBeTruthy()
  })

  it('uses twoPageLayout', () => {
    expect(passportBookletModule.render.twoPageLayout).toBe(true)
  })

  it('uses self_cert_8cfr_v1 certification template', () => {
    expect(passportBookletModule.render.certificationTemplate).toBe('self_cert_8cfr_v1')
  })

  it('renders all 11 critical field keys', () => {
    const criticalKeys = passportBookletModule.criticalFields.map(f => f.key)
    for (const k of criticalKeys) {
      expect(passportBookletModule.render.renderFields).toContain(k)
    }
  })
})

// ── Convenience exports ───────────────────────────────────────────────────────

describe('PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS', () => {
  it('is a readonly array of 11 strings', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS.length).toBe(11)
    for (const k of PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS) {
      expect(typeof k).toBe('string')
    }
  })

  it('matches the module criticalFields keys exactly', () => {
    const moduleKeys = passportBookletModule.criticalFields.map(f => f.key)
    expect([...PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS]).toEqual(moduleKeys)
  })

  it('includes document_type (was missing from old 8-field hardcoded list)', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS).toContain('document_type')
  })

  it('includes patronymic (was missing from old 8-field hardcoded list)', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS).toContain('patronymic')
  })

  it('includes sex (was missing from old 8-field hardcoded list)', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS).toContain('sex')
  })
})

describe('PASSPORT_BOOKLET_GATE_FIELDS', () => {
  it('equals PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS', () => {
    expect([...PASSPORT_BOOKLET_GATE_FIELDS]).toEqual([...PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS])
  })

  it('has 11 fields (previously only 8 were checked — this is correct)', () => {
    expect(PASSPORT_BOOKLET_GATE_FIELDS.length).toBe(11)
  })
})

// ── Unsupported conditions ────────────────────────────────────────────────────

describe('passportBookletModule unsupportedConditions', () => {
  it('has at least 3 unsupported condition entries', () => {
    expect(passportBookletModule.unsupportedConditions.length).toBeGreaterThanOrEqual(3)
  })

  it('includes image_too_blurry condition', () => {
    const codes = passportBookletModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('image_too_blurry')
  })

  it('includes biometric_passport condition', () => {
    const codes = passportBookletModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('biometric_passport')
  })

  it('all unsupported conditions route to manual review', () => {
    for (const c of passportBookletModule.unsupportedConditions) {
      expect(c.action).toBe('route_to_manual_review')
    }
  })
})
