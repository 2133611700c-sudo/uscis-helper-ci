/**
 * Birth Certificate Module Tests
 *
 * Verifies the 14-field contract, active status, validators, review policy,
 * extraction config, and PDF render config.
 *
 * All tests use the module object directly — no live OCR, no real documents.
 */
import { describe, it, expect } from 'vitest'
import {
  birthCertificateModule,
  BIRTH_CERT_CRITICAL_FIELD_KEYS,
  BIRTH_CERT_ALL_FIELD_TARGETS,
  BIRTH_CERT_RENDER_FIELDS,
} from '../birthCertificate.module'

// ── Basic structure ───────────────────────────────────────────────────────────

describe('birthCertificateModule structure', () => {
  it('has documentType = ua_birth_certificate', () => {
    expect(birthCertificateModule.documentType).toBe('ua_birth_certificate')
  })

  it('has status = draft (demoted 2026-05-09 — synthetic-only E2E does not justify auto-PDF)', () => {
    expect(birthCertificateModule.status).toBe('draft')
  })

  it('has displayName in en, ru, uk', () => {
    expect(birthCertificateModule.displayName.en).toBeTruthy()
    expect(birthCertificateModule.displayName.ru).toBeTruthy()
    expect(birthCertificateModule.displayName.uk).toBeTruthy()
  })

  it('supports uk and ru languages', () => {
    expect(birthCertificateModule.supportedLanguages).toContain('uk')
    expect(birthCertificateModule.supportedLanguages).toContain('ru')
  })
})

// ── 14 Critical fields ────────────────────────────────────────────────────────

describe('birthCertificateModule criticalFields — 14-field contract', () => {
  it('has exactly 14 critical fields', () => {
    expect(birthCertificateModule.criticalFields.length).toBe(14)
  })

  it('contains all 14 expected critical field keys', () => {
    const keys = birthCertificateModule.criticalFields.map(f => f.key)
    const expected = [
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'child_surname',
      'child_given_name',
      'child_patronymic',
      'date_of_birth',
      'place_of_birth',
      'father_full_name',
      'mother_full_name',
      'issuing_authority',
      'date_of_issue',
    ]
    for (const k of expected) {
      expect(keys).toContain(k)
    }
  })

  it('has no duplicate critical field keys', () => {
    const keys = birthCertificateModule.criticalFields.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('all critical fields have reviewRequired = true', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(f.reviewRequired).toBe(true)
    }
  })

  it('all critical fields have required = true', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(f.required).toBe(true)
    }
  })

  it('all critical fields have fallbackIfMissing = review_required', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(f.fallbackIfMissing).toBe('review_required')
    }
  })

  it('all critical fields have evidenceRequired of required or preferred', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(['required', 'preferred']).toContain(f.evidenceRequired)
    }
  })

  it('each critical field has a label in en, ru, uk', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(f.label.en).toBeTruthy()
      expect(f.label.ru).toBeTruthy()
      expect(f.label.uk).toBeTruthy()
    }
  })

  it('each critical field has at least one sourceLabel', () => {
    for (const f of birthCertificateModule.criticalFields) {
      expect(f.sourceLabels.length).toBeGreaterThan(0)
    }
  })
})

// ── USCIS-critical: certificate_number ≠ act_record_number ───────────────────

describe('birthCertificateModule — certificate vs act record distinction', () => {
  it('certificate_number field exists', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    expect(f).toBeDefined()
  })

  it('act_record_number field exists separately', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(f).toBeDefined()
  })

  it('certificate_number and act_record_number are different fields', () => {
    const cert = birthCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    const act = birthCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(cert).not.toBe(act)
    expect(cert?.key).not.toBe(act?.key)
  })

  it('certificate_number has certificate_number_not_act_record_number validator', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'certificate_number')
    expect(f?.validators).toContain('certificate_number_not_act_record_number')
  })

  it('act_record_number has certificate_number_not_act_record_number validator', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(f?.validators).toContain('certificate_number_not_act_record_number')
  })

  it('act_record_number sourceLabels include "АКТОВИЙ ЗАПИС №"', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'act_record_number')
    expect(f?.sourceLabels.some(l => l.includes('АКТОВИЙ ЗАПИС'))).toBe(true)
  })

  it('act_record_date sourceLabels include "ДАТА СКЛАДАННЯ ЗАПИСУ"', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'act_record_date')
    expect(f?.sourceLabels.some(l => l.includes('ДАТА'))).toBe(true)
  })
})

// ── Parent and child name fields ──────────────────────────────────────────────

describe('birthCertificateModule — parent and child name fields', () => {
  it('child_patronymic field key is child_patronymic (not child_middle_name)', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'child_patronymic')
    expect(f).toBeDefined()
    expect(f?.key).toBe('child_patronymic')
  })

  it('child_patronymic label.en contains Patronymic (not Middle Name)', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'child_patronymic')
    expect(f?.label.en).toContain('Patronymic')
    expect(f?.label.en.toLowerCase()).not.toContain('middle name')
  })

  it('father_full_name field exists', () => {
    expect(birthCertificateModule.criticalFields.find(f => f.key === 'father_full_name')).toBeDefined()
  })

  it('mother_full_name field exists', () => {
    expect(birthCertificateModule.criticalFields.find(f => f.key === 'mother_full_name')).toBeDefined()
  })

  it('father_full_name has parent_names_not_swapped validator', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'father_full_name')
    expect(f?.validators).toContain('parent_names_not_swapped')
  })

  it('mother_full_name has parent_names_not_swapped validator', () => {
    const f = birthCertificateModule.criticalFields.find(f => f.key === 'mother_full_name')
    expect(f?.validators).toContain('parent_names_not_swapped')
  })

  it('father and mother sourceLabels are different', () => {
    const father = birthCertificateModule.criticalFields.find(f => f.key === 'father_full_name')
    const mother = birthCertificateModule.criticalFields.find(f => f.key === 'mother_full_name')
    const fatherLabels = new Set(father?.sourceLabels ?? [])
    const motherLabels = new Set(mother?.sourceLabels ?? [])
    const intersection = [...fatherLabels].filter(l => motherLabels.has(l))
    expect(intersection.length).toBe(0)
  })
})

// ── Optional fields ───────────────────────────────────────────────────────────

describe('birthCertificateModule optionalFields', () => {
  it('has at least 5 optional fields', () => {
    expect(birthCertificateModule.optionalFields.length).toBeGreaterThanOrEqual(5)
  })

  it('includes repeated_certificate_marker', () => {
    const keys = birthCertificateModule.optionalFields.map(f => f.key)
    expect(keys).toContain('repeated_certificate_marker')
  })

  it('all optional fields have required = false', () => {
    for (const f of birthCertificateModule.optionalFields) {
      expect(f.required).toBe(false)
    }
  })

  it('all optional fields have fallbackIfMissing = skip', () => {
    for (const f of birthCertificateModule.optionalFields) {
      expect(f.fallbackIfMissing).toBe('skip')
    }
  })

  it('repeated_certificate_marker has reviewRequired = true (affects status)', () => {
    const f = birthCertificateModule.optionalFields.find(f => f.key === 'repeated_certificate_marker')
    expect(f?.reviewRequired).toBe(true)
  })
})

// ── Validators ────────────────────────────────────────────────────────────────

describe('birthCertificateModule validators', () => {
  it('includes certificate_number_not_act_record_number', () => {
    expect(birthCertificateModule.validators).toContain('certificate_number_not_act_record_number')
  })

  it('includes act_record_date_lock', () => {
    expect(birthCertificateModule.validators).toContain('act_record_date_lock')
  })

  it('includes date_of_birth_lock', () => {
    expect(birthCertificateModule.validators).toContain('date_of_birth_lock')
  })

  it('includes date_of_issue_lock', () => {
    expect(birthCertificateModule.validators).toContain('date_of_issue_lock')
  })

  it('includes parent_names_not_swapped', () => {
    expect(birthCertificateModule.validators).toContain('parent_names_not_swapped')
  })

  it('includes civil_registry_glossary', () => {
    expect(birthCertificateModule.validators).toContain('civil_registry_glossary')
  })

  it('includes source_evidence_required', () => {
    expect(birthCertificateModule.validators).toContain('source_evidence_required')
  })

  it('includes bilingual_layer', () => {
    expect(birthCertificateModule.validators).toContain('bilingual_layer')
  })

  it('includes name_mixed_script', () => {
    expect(birthCertificateModule.validators).toContain('name_mixed_script')
  })

  it('includes nominative_case_required', () => {
    expect(birthCertificateModule.validators).toContain('nominative_case_required')
  })

  it('includes forbidden_birth_cert_mislabels', () => {
    expect(birthCertificateModule.validators).toContain('forbidden_birth_cert_mislabels')
  })
})

// ── Review policy ─────────────────────────────────────────────────────────────

describe('birthCertificateModule reviewPolicy', () => {
  it('has allowAutoPdf = false (demoted 2026-05-09 — defense-in-depth alongside status:draft)', () => {
    expect(birthCertificateModule.reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('has requireUserConfirmation = true', () => {
    expect(birthCertificateModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('has requireEvidenceForCriticalFields = true', () => {
    expect(birthCertificateModule.reviewPolicy.requireEvidenceForCriticalFields).toBe(true)
  })

  it('has manualReviewIfMissingCritical = true', () => {
    expect(birthCertificateModule.reviewPolicy.manualReviewIfMissingCritical).toBe(true)
  })

  it('has manualReviewIfLowConfidence = true', () => {
    expect(birthCertificateModule.reviewPolicy.manualReviewIfLowConfidence).toBe(true)
  })

  it('has lowConfidenceThreshold = 0.85', () => {
    expect(birthCertificateModule.reviewPolicy.lowConfidenceThreshold).toBe(0.85)
  })
})

// ── Extraction config ─────────────────────────────────────────────────────────

describe('birthCertificateModule extraction', () => {
  it('uses google_vision as OCR provider', () => {
    expect(birthCertificateModule.extraction.ocrProvider).toBe('google_vision')
  })

  it('uses deepseek_text as field mapper', () => {
    expect(birthCertificateModule.extraction.fieldMapper).toBe('deepseek_text')
  })

  it('fieldTargets includes all 14 critical field keys', () => {
    const targets = birthCertificateModule.extraction.fieldTargets
    const criticalKeys = birthCertificateModule.criticalFields.map(f => f.key)
    for (const k of criticalKeys) {
      expect(targets).toContain(k)
    }
  })

  it('fieldTargets includes optional fields', () => {
    const targets = birthCertificateModule.extraction.fieldTargets
    expect(targets).toContain('citizenship')
    expect(targets).toContain('sex')
    expect(targets).toContain('registration_place')
    expect(targets).toContain('repeated_certificate_marker')
  })

  it('glossaryFiles includes civil_registry_terms.json', () => {
    expect(birthCertificateModule.extraction.glossaryFiles).toContain('civil_registry_terms.json')
  })

  it('has a timeout of 45000ms', () => {
    expect(birthCertificateModule.extraction.timeoutMs).toBe(45_000)
  })
})

// ── Render config ─────────────────────────────────────────────────────────────

describe('birthCertificateModule render', () => {
  it('has templateId = birth_certificate_v1', () => {
    expect(birthCertificateModule.render.templateId).toBe('birth_certificate_v1')
  })

  it('uses self_cert_birth_v1 certification template', () => {
    expect(birthCertificateModule.render.certificationTemplate).toBe('self_cert_birth_v1')
  })

  it('uses twoPageLayout', () => {
    expect(birthCertificateModule.render.twoPageLayout).toBe(true)
  })

  it('renderFields includes all 14 critical field keys', () => {
    const render = birthCertificateModule.render.renderFields
    const criticalKeys = birthCertificateModule.criticalFields.map(f => f.key)
    for (const k of criticalKeys) {
      expect(render).toContain(k)
    }
  })

  it('renderFields does NOT include act_record_number in certificate_number position', () => {
    const render = birthCertificateModule.render.renderFields
    const certIdx = render.indexOf('certificate_number')
    const actIdx = render.indexOf('act_record_number')
    // Both present
    expect(certIdx).toBeGreaterThanOrEqual(0)
    expect(actIdx).toBeGreaterThanOrEqual(0)
    // They are different entries
    expect(certIdx).not.toBe(actIdx)
  })
})

// ── Unsupported conditions ────────────────────────────────────────────────────

describe('birthCertificateModule unsupportedConditions', () => {
  it('has at least 9 unsupported conditions', () => {
    expect(birthCertificateModule.unsupportedConditions.length).toBeGreaterThanOrEqual(9)
  })

  it('all conditions route to manual_review', () => {
    for (const c of birthCertificateModule.unsupportedConditions) {
      expect(c.action).toBe('route_to_manual_review')
    }
  })

  it('all conditions have non-empty descriptions', () => {
    for (const c of birthCertificateModule.unsupportedConditions) {
      expect(c.description.length).toBeGreaterThan(0)
    }
  })

  it('all condition codes are unique', () => {
    const codes = birthCertificateModule.unsupportedConditions.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('includes soviet_era_handwriting condition', () => {
    const codes = birthCertificateModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('soviet_era_handwriting')
  })

  it('includes act_record_number_ambiguous condition', () => {
    const codes = birthCertificateModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('act_record_number_ambiguous')
  })

  it('includes image_quality_failed condition', () => {
    const codes = birthCertificateModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('image_quality_failed')
  })
})

// ── userStatusMessage ─────────────────────────────────────────────────────────

describe('birthCertificateModule userStatusMessage', () => {
  it('has a defined userStatusMessage', () => {
    expect(birthCertificateModule.userStatusMessage).toBeTruthy()
  })

  it('does not mention OCR, bbox, or source trace', () => {
    const msg = birthCertificateModule.userStatusMessage ?? ''
    expect(msg.toLowerCase()).not.toContain('ocr')
    expect(msg.toLowerCase()).not.toContain('bbox')
    expect(msg.toLowerCase()).not.toContain('source trace')
    expect(msg.toLowerCase()).not.toContain('bounding box')
  })

  it('does not use "unsupported error" wording', () => {
    const msg = birthCertificateModule.userStatusMessage ?? ''
    expect(msg.toLowerCase()).not.toContain('unsupported error')
  })
})

// ── Convenience exports ───────────────────────────────────────────────────────

describe('BIRTH_CERT_CRITICAL_FIELD_KEYS', () => {
  it('is readonly array of 14 strings', () => {
    expect(BIRTH_CERT_CRITICAL_FIELD_KEYS.length).toBe(14)
    for (const k of BIRTH_CERT_CRITICAL_FIELD_KEYS) {
      expect(typeof k).toBe('string')
    }
  })

  it('matches module criticalFields keys exactly', () => {
    const moduleKeys = birthCertificateModule.criticalFields.map(f => f.key)
    expect([...BIRTH_CERT_CRITICAL_FIELD_KEYS]).toEqual(moduleKeys)
  })

  it('contains act_record_number (not just certificate_number)', () => {
    expect(BIRTH_CERT_CRITICAL_FIELD_KEYS).toContain('act_record_number')
  })

  it('contains child_patronymic (not child_middle_name)', () => {
    expect(BIRTH_CERT_CRITICAL_FIELD_KEYS).toContain('child_patronymic')
    expect(BIRTH_CERT_CRITICAL_FIELD_KEYS).not.toContain('child_middle_name')
  })
})

describe('BIRTH_CERT_ALL_FIELD_TARGETS', () => {
  it('has at least 21 entries (14 critical + 7 optional)', () => {
    expect(BIRTH_CERT_ALL_FIELD_TARGETS.length).toBeGreaterThanOrEqual(21)
  })

  it('includes all critical fields', () => {
    for (const k of BIRTH_CERT_CRITICAL_FIELD_KEYS) {
      expect(BIRTH_CERT_ALL_FIELD_TARGETS).toContain(k)
    }
  })
})

describe('BIRTH_CERT_RENDER_FIELDS', () => {
  it('has 14 entries', () => {
    expect(BIRTH_CERT_RENDER_FIELDS.length).toBe(14)
  })

  it('equals the critical field list', () => {
    expect([...BIRTH_CERT_RENDER_FIELDS]).toEqual([...BIRTH_CERT_CRITICAL_FIELD_KEYS])
  })
})
