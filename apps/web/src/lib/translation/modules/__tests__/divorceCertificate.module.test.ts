/**
 * Divorce Certificate Module Tests — Messenginfo v6.0
 *
 * Validates the module contract, 15-field requirement, and all key invariants.
 * Uses module definitions only — no live OCR, no real documents.
 */
import { describe, it, expect } from 'vitest'
import { divorceCertificateModule, DIVORCE_CERT_CRITICAL_FIELD_KEYS, DIVORCE_CERT_ALL_FIELD_TARGETS, DIVORCE_CERT_RENDER_FIELDS } from '../divorceCertificate.module'

describe('divorceCertificateModule — structure', () => {
  it('has correct documentType', () => {
    expect(divorceCertificateModule.documentType).toBe('ua_divorce_certificate')
  })

  it('is status draft (demoted 2026-05-09 — no real fixture / no E2E / complex_legal_basis path unverified)', () => {
    expect(divorceCertificateModule.status).toBe('draft')
  })

  it('supports uk and ru languages', () => {
    expect(divorceCertificateModule.supportedLanguages).toContain('uk')
    expect(divorceCertificateModule.supportedLanguages).toContain('ru')
  })

  it('has English display name', () => {
    expect(divorceCertificateModule.displayName.en).toBe('Ukrainian Divorce Certificate')
  })

  it('has Ukrainian display name', () => {
    expect(divorceCertificateModule.displayName.uk).toContain('Свідоцтво про розірвання шлюбу')
  })

  it('has Russian display name', () => {
    expect(divorceCertificateModule.displayName.ru).toContain('Свидетельство о расторжении брака')
  })
})

describe('divorceCertificateModule — 15-field contract', () => {
  it('has exactly 15 critical fields', () => {
    expect(divorceCertificateModule.criticalFields).toHaveLength(15)
  })

  it('every critical field has reviewRequired=true', () => {
    for (const f of divorceCertificateModule.criticalFields) {
      expect(f.reviewRequired).toBe(true)
    }
  })

  it('every critical field has required=true', () => {
    for (const f of divorceCertificateModule.criticalFields) {
      expect(f.required).toBe(true)
    }
  })

  it('critical field keys are unique', () => {
    const keys = divorceCertificateModule.criticalFields.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  const expectedKeys = [
    'document_type',
    'certificate_series',
    'certificate_number',
    'act_record_number',
    'act_record_date',
    'spouse_1_surname',
    'spouse_1_given_name',
    'spouse_1_patronymic',
    'spouse_2_surname',
    'spouse_2_given_name',
    'spouse_2_patronymic',
    'date_of_divorce',
    'basis_of_divorce',
    'issuing_authority',
    'date_of_issue',
  ]

  for (const key of expectedKeys) {
    it(`has critical field: ${key}`, () => {
      const found = divorceCertificateModule.criticalFields.find(f => f.key === key)
      expect(found).toBeDefined()
    })
  }
})

describe('divorceCertificateModule — certificate vs act record distinction', () => {
  it('certificate_number and act_record_number are separate fields', () => {
    const cert = divorceCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    const act = divorceCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(cert).toBeDefined()
    expect(act).toBeDefined()
    expect(cert!.key).not.toBe(act!.key)
  })

  it('certificate_number has certificate_number_not_act_record_number validator', () => {
    const cert = divorceCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    expect(cert!.validators).toContain('certificate_number_not_act_record_number')
  })

  it('act_record_date has act_record_date_lock validator', () => {
    const f = divorceCertificateModule.criticalFields.find(f => f.key === 'act_record_date')
    expect(f!.validators).toContain('act_record_date_lock')
  })

  it('date_of_divorce has date_of_divorce_lock validator', () => {
    const f = divorceCertificateModule.criticalFields.find(f => f.key === 'date_of_divorce')
    expect(f!.validators).toContain('date_of_divorce_lock')
  })
})

describe('divorceCertificateModule — spouse fields', () => {
  it('has 3 spouse_1 fields (surname, given_name, patronymic)', () => {
    const s1 = divorceCertificateModule.criticalFields.filter(f => f.key.startsWith('spouse_1'))
    expect(s1).toHaveLength(3)
  })

  it('has 3 spouse_2 fields', () => {
    const s2 = divorceCertificateModule.criticalFields.filter(f => f.key.startsWith('spouse_2'))
    expect(s2).toHaveLength(3)
  })

  it('spouse_1_patronymic label does NOT say Middle Name', () => {
    const p1 = divorceCertificateModule.criticalFields.find(f => f.key === 'spouse_1_patronymic')
    expect(p1!.label.en.toLowerCase()).not.toContain('middle name')
    expect(p1!.label.en).toContain('Patronymic')
  })

  it('spouse_2_patronymic label does NOT say Middle Name', () => {
    const p2 = divorceCertificateModule.criticalFields.find(f => f.key === 'spouse_2_patronymic')
    expect(p2!.label.en.toLowerCase()).not.toContain('middle name')
    expect(p2!.label.en).toContain('Patronymic')
  })
})

describe('divorceCertificateModule — basis_of_divorce', () => {
  it('has basis_of_divorce as critical field', () => {
    expect(divorceCertificateModule.criticalFields.find(f => f.key === 'basis_of_divorce')).toBeDefined()
  })

  it('basis_of_divorce has basis_of_divorce_required_or_review validator', () => {
    const f = divorceCertificateModule.criticalFields.find(f => f.key === 'basis_of_divorce')
    expect(f!.validators).toContain('basis_of_divorce_required_or_review')
  })

  it('basis_of_divorce has court_decision_details_not_invented validator', () => {
    const f = divorceCertificateModule.criticalFields.find(f => f.key === 'basis_of_divorce')
    expect(f!.validators).toContain('court_decision_details_not_invented')
  })

  it('basis_of_divorce fallback routes to manual_review', () => {
    const f = divorceCertificateModule.criticalFields.find(f => f.key === 'basis_of_divorce')
    expect(f!.fallbackIfMissing).toBe('manual_review')
  })
})

describe('divorceCertificateModule — court decision optional fields', () => {
  it('court_decision_number is optional', () => {
    expect(divorceCertificateModule.optionalFields.find(f => f.key === 'court_decision_number')).toBeDefined()
  })

  it('court_decision_date is optional', () => {
    expect(divorceCertificateModule.optionalFields.find(f => f.key === 'court_decision_date')).toBeDefined()
  })

  it('court_name is optional', () => {
    expect(divorceCertificateModule.optionalFields.find(f => f.key === 'court_name')).toBeDefined()
  })

  it('court_decision_number has court_decision_details_not_invented validator', () => {
    const f = divorceCertificateModule.optionalFields.find(f => f.key === 'court_decision_number')
    expect(f!.validators).toContain('court_decision_details_not_invented')
  })
})

describe('divorceCertificateModule — optional fields', () => {
  it('has 8 optional fields', () => {
    expect(divorceCertificateModule.optionalFields).toHaveLength(8)
  })
})

describe('divorceCertificateModule — review policy', () => {
  it('requireUserConfirmation is true', () => {
    expect(divorceCertificateModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('allowAutoPdf is false (demoted 2026-05-09 — defense-in-depth alongside status:draft)', () => {
    expect(divorceCertificateModule.reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('manualReviewIfMissingCritical is true', () => {
    expect(divorceCertificateModule.reviewPolicy.manualReviewIfMissingCritical).toBe(true)
  })

  it('lowConfidenceThreshold is 0.85', () => {
    expect(divorceCertificateModule.reviewPolicy.lowConfidenceThreshold).toBe(0.85)
  })
})

describe('divorceCertificateModule — extraction config', () => {
  it('uses google_vision OCR provider', () => {
    expect(divorceCertificateModule.extraction.ocrProvider).toBe('google_vision')
  })

  it('uses deepseek_text field mapper', () => {
    expect(divorceCertificateModule.extraction.fieldMapper).toBe('deepseek_text')
  })

  it('fieldTargets includes all 15 critical field keys', () => {
    const targets = divorceCertificateModule.extraction.fieldTargets
    const criticalKeys = divorceCertificateModule.criticalFields.map(f => f.key)
    for (const key of criticalKeys) {
      expect(targets).toContain(key)
    }
  })

  it('has 23 field targets total (15 critical + 8 optional)', () => {
    expect(divorceCertificateModule.extraction.fieldTargets).toHaveLength(23)
  })
})

describe('divorceCertificateModule — unsupported conditions', () => {
  it('has at least 10 unsupported conditions', () => {
    expect(divorceCertificateModule.unsupportedConditions.length).toBeGreaterThanOrEqual(10)
  })

  it('all unsupported conditions route to manual review', () => {
    for (const c of divorceCertificateModule.unsupportedConditions) {
      expect(c.action).toBe('route_to_manual_review')
    }
  })

  it('has basis_of_divorce_unclear condition', () => {
    expect(divorceCertificateModule.unsupportedConditions.find(c => c.code === 'basis_of_divorce_unclear')).toBeDefined()
  })

  it('has court_decision_text_complex condition', () => {
    expect(divorceCertificateModule.unsupportedConditions.find(c => c.code === 'court_decision_text_complex')).toBeDefined()
  })
})

describe('divorceCertificateModule — convenience exports', () => {
  it('DIVORCE_CERT_CRITICAL_FIELD_KEYS has 15 entries', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toHaveLength(15)
  })

  it('DIVORCE_CERT_ALL_FIELD_TARGETS has 23 entries', () => {
    expect(DIVORCE_CERT_ALL_FIELD_TARGETS).toHaveLength(23)
  })

  it('DIVORCE_CERT_RENDER_FIELDS has 15 entries', () => {
    expect(DIVORCE_CERT_RENDER_FIELDS).toHaveLength(15)
  })
})
