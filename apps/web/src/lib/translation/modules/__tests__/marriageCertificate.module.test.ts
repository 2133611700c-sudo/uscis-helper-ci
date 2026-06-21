/**
 * Marriage Certificate Module Tests — Messenginfo v6.0
 *
 * Validates the module contract, 16-field requirement, and all key invariants.
 * Uses module definitions only — no live OCR, no real documents.
 */
import { describe, it, expect } from 'vitest'
import { marriageCertificateModule, MARRIAGE_CERT_CRITICAL_FIELD_KEYS, MARRIAGE_CERT_ALL_FIELD_TARGETS, MARRIAGE_CERT_RENDER_FIELDS } from '../marriageCertificate.module'

describe('marriageCertificateModule — structure', () => {
  it('has correct documentType', () => {
    expect(marriageCertificateModule.documentType).toBe('ua_marriage_certificate')
  })

  it('is status draft (demoted 2026-05-09 — no real fixture / no E2E)', () => {
    expect(marriageCertificateModule.status).toBe('draft')
  })

  it('supports uk and ru languages', () => {
    expect(marriageCertificateModule.supportedLanguages).toContain('uk')
    expect(marriageCertificateModule.supportedLanguages).toContain('ru')
  })

  it('has English display name', () => {
    expect(marriageCertificateModule.displayName.en).toBe('Ukrainian Marriage Certificate')
  })

  it('has Ukrainian display name', () => {
    expect(marriageCertificateModule.displayName.uk).toContain('Свідоцтво про шлюб')
  })

  it('has Russian display name', () => {
    expect(marriageCertificateModule.displayName.ru).toContain('Свидетельство о браке')
  })
})

describe('marriageCertificateModule — 16-field contract', () => {
  it('has exactly 16 critical fields', () => {
    expect(marriageCertificateModule.criticalFields).toHaveLength(16)
  })

  it('every critical field has reviewRequired=true', () => {
    for (const f of marriageCertificateModule.criticalFields) {
      expect(f.reviewRequired).toBe(true)
    }
  })

  it('every critical field has required=true', () => {
    for (const f of marriageCertificateModule.criticalFields) {
      expect(f.required).toBe(true)
    }
  })

  it('every critical field has a non-empty key', () => {
    for (const f of marriageCertificateModule.criticalFields) {
      expect(f.key.length).toBeGreaterThan(0)
    }
  })

  it('critical field keys are unique', () => {
    const keys = marriageCertificateModule.criticalFields.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  const expectedKeys = [
    'document_type',
    'certificate_series',
    'certificate_number',
    'act_record_number',
    'act_record_date',
    'spouse_1_surname_before_marriage',
    'spouse_1_given_name',
    'spouse_1_patronymic',
    'spouse_1_surname_after_marriage',
    'spouse_2_surname_before_marriage',
    'spouse_2_given_name',
    'spouse_2_patronymic',
    'spouse_2_surname_after_marriage',
    'date_of_marriage',
    'issuing_authority',
    'date_of_issue',
  ]

  for (const key of expectedKeys) {
    it(`has critical field: ${key}`, () => {
      const found = marriageCertificateModule.criticalFields.find(f => f.key === key)
      expect(found).toBeDefined()
    })
  }
})

describe('marriageCertificateModule — certificate vs act record distinction', () => {
  it('certificate_number and act_record_number are separate fields', () => {
    const cert = marriageCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    const act = marriageCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(cert).toBeDefined()
    expect(act).toBeDefined()
    expect(cert!.key).not.toBe(act!.key)
  })

  it('certificate_number has certificate_number_not_act_record_number validator', () => {
    const cert = marriageCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    expect(cert!.validators).toContain('certificate_number_not_act_record_number')
  })

  it('act_record_number has certificate_number_not_act_record_number validator', () => {
    const act = marriageCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(act!.validators).toContain('certificate_number_not_act_record_number')
  })

  it('act_record_number sourceLabels include АКТОВИЙ ЗАПИС', () => {
    const act = marriageCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(act!.sourceLabels.some(l => l.includes('АКТОВИЙ ЗАПИС'))).toBe(true)
  })

  it('act_record_date has act_record_date_lock validator', () => {
    const f = marriageCertificateModule.criticalFields.find(f => f.key === 'act_record_date')
    expect(f!.validators).toContain('act_record_date_lock')
  })

  it('date_of_marriage has date_of_marriage_lock validator', () => {
    const f = marriageCertificateModule.criticalFields.find(f => f.key === 'date_of_marriage')
    expect(f!.validators).toContain('date_of_marriage_lock')
  })
})

describe('marriageCertificateModule — spouse fields', () => {
  it('has 4 spouse_1 fields', () => {
    const s1 = marriageCertificateModule.criticalFields.filter(f => f.key.startsWith('spouse_1'))
    expect(s1).toHaveLength(4)
  })

  it('has 4 spouse_2 fields', () => {
    const s2 = marriageCertificateModule.criticalFields.filter(f => f.key.startsWith('spouse_2'))
    expect(s2).toHaveLength(4)
  })

  it('has before-marriage surname for both spouses', () => {
    expect(marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_1_surname_before_marriage')).toBeDefined()
    expect(marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_2_surname_before_marriage')).toBeDefined()
  })

  it('has after-marriage surname for both spouses', () => {
    expect(marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_1_surname_after_marriage')).toBeDefined()
    expect(marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_2_surname_after_marriage')).toBeDefined()
  })

  it('patronymic label does NOT say Middle Name', () => {
    const p1 = marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_1_patronymic')
    const p2 = marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_2_patronymic')
    expect(p1!.label.en.toLowerCase()).not.toContain('middle name')
    expect(p2!.label.en.toLowerCase()).not.toContain('middle name')
    expect(p1!.label.en).toContain('Patronymic')
    expect(p2!.label.en).toContain('Patronymic')
  })

  it('before_after_surname_not_swapped in patronymic validators', () => {
    const p1 = marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_1_patronymic')
    expect(p1!.validators).toContain('forbidden_marriage_mislabels')
  })

  it('spouse_1_surname_before_marriage has spouse_order_preserved validator', () => {
    const f = marriageCertificateModule.criticalFields.find(f => f.key === 'spouse_1_surname_before_marriage')
    expect(f!.validators).toContain('spouse_order_preserved')
  })
})

describe('marriageCertificateModule — optional fields', () => {
  it('has 7 optional fields', () => {
    expect(marriageCertificateModule.optionalFields).toHaveLength(7)
  })

  it('place_of_marriage_registration is optional', () => {
    expect(marriageCertificateModule.optionalFields.find(f => f.key === 'place_of_marriage_registration')).toBeDefined()
  })

  it('repeated_certificate_marker is optional with reviewRequired=true', () => {
    const f = marriageCertificateModule.optionalFields.find(f => f.key === 'repeated_certificate_marker')
    expect(f).toBeDefined()
    expect(f!.reviewRequired).toBe(true)
  })
})

describe('marriageCertificateModule — review policy', () => {
  it('requireUserConfirmation is true', () => {
    expect(marriageCertificateModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('allowAutoPdf is false (demoted 2026-05-09 — defense-in-depth alongside status:draft)', () => {
    expect(marriageCertificateModule.reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('manualReviewIfMissingCritical is true', () => {
    expect(marriageCertificateModule.reviewPolicy.manualReviewIfMissingCritical).toBe(true)
  })

  it('lowConfidenceThreshold is 0.85', () => {
    expect(marriageCertificateModule.reviewPolicy.lowConfidenceThreshold).toBe(0.85)
  })
})

describe('marriageCertificateModule — extraction config', () => {
  it('uses google_vision OCR provider', () => {
    expect(marriageCertificateModule.extraction.ocrProvider).toBe('google_vision')
  })

  it('uses deepseek_text field mapper', () => {
    expect(marriageCertificateModule.extraction.fieldMapper).toBe('deepseek_text')
  })

  it('fieldTargets includes all 16 critical field keys', () => {
    const targets = marriageCertificateModule.extraction.fieldTargets
    const criticalKeys = marriageCertificateModule.criticalFields.map(f => f.key)
    for (const key of criticalKeys) {
      expect(targets).toContain(key)
    }
  })

  it('has 23 field targets total (16 critical + 7 optional)', () => {
    expect(marriageCertificateModule.extraction.fieldTargets).toHaveLength(23)
  })
})

describe('marriageCertificateModule — render config', () => {
  it('renderFields has 16 entries', () => {
    expect(marriageCertificateModule.render.renderFields).toHaveLength(16)
  })

  it('certificationTemplate is self_cert_marriage_v1', () => {
    expect(marriageCertificateModule.render.certificationTemplate).toBe('self_cert_marriage_v1')
  })
})

describe('marriageCertificateModule — unsupported conditions', () => {
  it('has at least 10 unsupported conditions', () => {
    expect(marriageCertificateModule.unsupportedConditions.length).toBeGreaterThanOrEqual(10)
  })

  it('all unsupported conditions route to manual review', () => {
    for (const c of marriageCertificateModule.unsupportedConditions) {
      expect(c.action).toBe('route_to_manual_review')
    }
  })

  it('has surname_labels_unclear condition', () => {
    expect(marriageCertificateModule.unsupportedConditions.find(c => c.code === 'surname_labels_unclear')).toBeDefined()
  })

  it('has act_record_number_missing condition', () => {
    expect(marriageCertificateModule.unsupportedConditions.find(c => c.code === 'act_record_number_missing')).toBeDefined()
  })
})

describe('marriageCertificateModule — userStatusMessage', () => {
  it('has a user-safe message', () => {
    expect(marriageCertificateModule.userStatusMessage).toBeDefined()
    expect(marriageCertificateModule.userStatusMessage!.length).toBeGreaterThan(10)
  })

  it('does not contain technical jargon', () => {
    const msg = marriageCertificateModule.userStatusMessage ?? ''
    expect(msg.toLowerCase()).not.toContain('ocr')
    expect(msg.toLowerCase()).not.toContain('bbox')
    expect(msg.toLowerCase()).not.toContain('error')
  })
})

describe('marriageCertificateModule — convenience exports', () => {
  it('MARRIAGE_CERT_CRITICAL_FIELD_KEYS has 16 entries', () => {
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toHaveLength(16)
  })

  it('MARRIAGE_CERT_ALL_FIELD_TARGETS has 23 entries', () => {
    expect(MARRIAGE_CERT_ALL_FIELD_TARGETS).toHaveLength(23)
  })

  it('MARRIAGE_CERT_RENDER_FIELDS has 16 entries', () => {
    expect(MARRIAGE_CERT_RENDER_FIELDS).toHaveLength(16)
  })
})
