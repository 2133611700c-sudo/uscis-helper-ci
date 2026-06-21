/**
 * Identity Module Tests — Messenginfo v6.0
 *
 * Tests internationalPassportModule and ukrainianIdCardModule:
 *   - Field counts, critical constraints (allowAutoPdf=false, status=draft)
 *   - RNOKPP sensitive field handling
 *   - document_number ≠ record_number separation
 *   - MRZ lines excluded from render fields
 *   - Registry routing (draft → manualReview)
 *   - Classifier alias resolution
 */
import { describe, it, expect } from 'vitest'
import { internationalPassportModule } from '../internationalPassport.module'
import { ukrainianIdCardModule } from '../ukrainianIdCard.module'
import {
  findDocumentModule,
  getDocumentModule,
  listDocumentModules,
  listActiveModules,
  getRegisteredDocumentTypes,
  isAutoDraftSupported,
} from '../registry'
import { classifyDocumentType, resolveDocumentModule } from '../classifier'

// ── internationalPassportModule — shape ───────────────────────────────────────

describe('internationalPassportModule — document type', () => {
  it('has documentType ua_international_passport', () => {
    expect(internationalPassportModule.documentType).toBe('ua_international_passport')
  })

  it('has status draft (not active)', () => {
    expect(internationalPassportModule.status).toBe('draft')
  })

  it('has allowAutoPdf=false (CRITICAL: never auto-generate PDF)', () => {
    expect(internationalPassportModule.reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('has requireUserConfirmation=true', () => {
    expect(internationalPassportModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })
})

describe('internationalPassportModule — critical fields', () => {
  it('has exactly 16 critical fields', () => {
    expect(internationalPassportModule.criticalFields).toHaveLength(16)
  })

  it('contains surname_latin', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('surname_latin')
  })

  it('contains given_names_latin', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('given_names_latin')
  })

  it('contains patronymic_cyrillic (not in MRZ — VIZ only)', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('patronymic_cyrillic')
  })

  it('contains document_number', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('document_number')
  })

  it('contains mrz_line_1', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('mrz_line_1')
  })

  it('contains mrz_line_2', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('mrz_line_2')
  })

  it('contains personal_number (RNOKPP cross-check only)', () => {
    const keys = internationalPassportModule.criticalFields.map(f => f.key)
    expect(keys).toContain('personal_number')
  })

  it('all critical fields have reviewRequired=true', () => {
    for (const field of internationalPassportModule.criticalFields) {
      expect(field.reviewRequired).toBe(true)
    }
  })
})

describe('internationalPassportModule — personal_number safety', () => {
  it('personal_number has reviewRequired=true (always)', () => {
    const pn = internationalPassportModule.criticalFields.find(f => f.key === 'personal_number')
    expect(pn?.reviewRequired).toBe(true)
  })

  it('personal_number uses personal_number_sensitive validator', () => {
    const pn = internationalPassportModule.criticalFields.find(f => f.key === 'personal_number')
    expect(pn?.validators).toContain('personal_number_sensitive')
  })

  it('personal_number is NOT in render fields (suppressed from PDF)', () => {
    expect(internationalPassportModule.render.renderFields).not.toContain('personal_number')
  })

  it('mrz_line_1 is NOT in render fields (suppressed from PDF)', () => {
    expect(internationalPassportModule.render.renderFields).not.toContain('mrz_line_1')
  })

  it('mrz_line_2 is NOT in render fields (suppressed from PDF)', () => {
    expect(internationalPassportModule.render.renderFields).not.toContain('mrz_line_2')
  })
})

describe('internationalPassportModule — MRZ validators', () => {
  it('includes mrz_td3_check_digits validator', () => {
    expect(internationalPassportModule.validators).toContain('mrz_td3_check_digits')
  })

  it('includes mrz_viz_surname_match validator', () => {
    expect(internationalPassportModule.validators).toContain('mrz_viz_surname_match')
  })

  it('includes mrz_viz_dob_match validator', () => {
    expect(internationalPassportModule.validators).toContain('mrz_viz_dob_match')
  })

  it('includes latin_name_no_retransliteration validator', () => {
    expect(internationalPassportModule.validators).toContain('latin_name_no_retransliteration')
  })
})

describe('internationalPassportModule — unsupported conditions', () => {
  it('has mrz_check_digit_failure condition', () => {
    const codes = internationalPassportModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('mrz_check_digit_failure')
  })

  it('has mrz_viz_mismatch condition', () => {
    const codes = internationalPassportModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('mrz_viz_mismatch')
  })

  it('mrz_check_digit_failure routes to manual review', () => {
    const cond = internationalPassportModule.unsupportedConditions.find(
      c => c.code === 'mrz_check_digit_failure'
    )
    expect(cond?.action).toBe('route_to_manual_review')
  })
})

// ── ukrainianIdCardModule — shape ─────────────────────────────────────────────

describe('ukrainianIdCardModule — document type', () => {
  it('has documentType ua_id_card', () => {
    expect(ukrainianIdCardModule.documentType).toBe('ua_id_card')
  })

  it('has status draft (not active)', () => {
    expect(ukrainianIdCardModule.status).toBe('draft')
  })

  it('has allowAutoPdf=false (CRITICAL: never auto-generate PDF)', () => {
    expect(ukrainianIdCardModule.reviewPolicy.allowAutoPdf).toBe(false)
  })
})

describe('ukrainianIdCardModule — critical fields', () => {
  it('has exactly 18 critical fields', () => {
    expect(ukrainianIdCardModule.criticalFields).toHaveLength(18)
  })

  it('contains both Latin and Cyrillic surname fields (bilingual face)', () => {
    const keys = ukrainianIdCardModule.criticalFields.map(f => f.key)
    expect(keys).toContain('surname_latin')
    expect(keys).toContain('surname_cyrillic')
  })

  it('contains both Latin and Cyrillic given name fields', () => {
    const keys = ukrainianIdCardModule.criticalFields.map(f => f.key)
    expect(keys).toContain('given_names_latin')
    expect(keys).toContain('given_names_cyrillic')
  })

  it('contains document_number AND record_number as separate fields', () => {
    const keys = ukrainianIdCardModule.criticalFields.map(f => f.key)
    expect(keys).toContain('document_number')
    expect(keys).toContain('record_number')
    // Verify they are distinct entries
    const docIdx = keys.indexOf('document_number')
    const recIdx = keys.indexOf('record_number')
    expect(docIdx).not.toBe(recIdx)
  })

  it('contains rnokpp (sensitive — cross-check only)', () => {
    const keys = ukrainianIdCardModule.criticalFields.map(f => f.key)
    expect(keys).toContain('rnokpp')
  })

  it('all critical fields have reviewRequired=true', () => {
    for (const field of ukrainianIdCardModule.criticalFields) {
      expect(field.reviewRequired).toBe(true)
    }
  })
})

describe('ukrainianIdCardModule — rnokpp (SENSITIVE PII) safety', () => {
  it('rnokpp has reviewRequired=true', () => {
    const rn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'rnokpp')
    expect(rn?.reviewRequired).toBe(true)
  })

  it('rnokpp uses rnokpp_sensitive validator', () => {
    const rn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'rnokpp')
    expect(rn?.validators).toContain('rnokpp_sensitive')
  })

  it('rnokpp is NOT in render fields (must not appear in customer PDF)', () => {
    expect(ukrainianIdCardModule.render.renderFields).not.toContain('rnokpp')
  })

  it('mrz_line_1 is NOT in render fields', () => {
    expect(ukrainianIdCardModule.render.renderFields).not.toContain('mrz_line_1')
  })

  it('mrz_line_2 is NOT in render fields', () => {
    expect(ukrainianIdCardModule.render.renderFields).not.toContain('mrz_line_2')
  })
})

describe('ukrainianIdCardModule — document_number ≠ record_number separation', () => {
  it('document_number field has document_number_not_record_number validator', () => {
    const dn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'document_number')
    expect(dn?.validators).toContain('document_number_not_record_number')
  })

  it('record_number field also has document_number_not_record_number validator', () => {
    const rn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'record_number')
    expect(rn?.validators).toContain('document_number_not_record_number')
  })

  it('document_number and record_number have different labels', () => {
    const dn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'document_number')
    const rn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'record_number')
    expect(dn?.label.en).not.toBe(rn?.label.en)
  })

  it('record_number label mentions УНЗР', () => {
    const rn = ukrainianIdCardModule.criticalFields.find(f => f.key === 'record_number')
    expect(rn?.label.en).toContain('УНЗР')
  })

  it('document_number is in render fields (appears in output)', () => {
    expect(ukrainianIdCardModule.render.renderFields).toContain('document_number')
  })

  it('record_number is in render fields (appears in output)', () => {
    expect(ukrainianIdCardModule.render.renderFields).toContain('record_number')
  })
})

describe('ukrainianIdCardModule — MRZ validators', () => {
  it('includes mrz_td1_check_digits validator', () => {
    expect(ukrainianIdCardModule.validators).toContain('mrz_td1_check_digits')
  })

  it('includes mrz_viz_dob_match validator', () => {
    expect(ukrainianIdCardModule.validators).toContain('mrz_viz_dob_match')
  })

  it('includes document_number_not_record_number validator', () => {
    expect(ukrainianIdCardModule.validators).toContain('document_number_not_record_number')
  })

  it('includes rnokpp_sensitive validator', () => {
    expect(ukrainianIdCardModule.validators).toContain('rnokpp_sensitive')
  })
})

describe('ukrainianIdCardModule — unsupported conditions', () => {
  it('has document_number_record_number_conflict condition', () => {
    const codes = ukrainianIdCardModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('document_number_record_number_conflict')
  })

  it('has td1_composite_check_failure condition', () => {
    const codes = ukrainianIdCardModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('td1_composite_check_failure')
  })

  it('has mrz_viz_mismatch condition routing to manual review', () => {
    const cond = ukrainianIdCardModule.unsupportedConditions.find(
      c => c.code === 'mrz_viz_mismatch'
    )
    expect(cond?.action).toBe('route_to_manual_review')
  })
})

// ── Registry routing ──────────────────────────────────────────────────────────

describe('registry — international passport routing', () => {
  it('findDocumentModule finds ua_international_passport', () => {
    expect(findDocumentModule('ua_international_passport')).toBe(internationalPassportModule)
  })

  it('getDocumentModule routes draft module to manualReview (not active)', () => {
    const resolved = getDocumentModule('ua_international_passport')
    expect(resolved.documentType).toBe('manual_review_required')
  })

  it('isAutoDraftSupported returns false for ua_international_passport', () => {
    expect(isAutoDraftSupported('ua_international_passport')).toBe(false)
  })
})

describe('registry — ua_id_card routing', () => {
  it('findDocumentModule finds ua_id_card', () => {
    expect(findDocumentModule('ua_id_card')).toBe(ukrainianIdCardModule)
  })

  it('getDocumentModule routes draft ua_id_card to manualReview', () => {
    const resolved = getDocumentModule('ua_id_card')
    expect(resolved.documentType).toBe('manual_review_required')
  })

  it('isAutoDraftSupported returns false for ua_id_card', () => {
    expect(isAutoDraftSupported('ua_id_card')).toBe(false)
  })
})

describe('registry — module listing', () => {
  it('listDocumentModules includes ua_international_passport', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_international_passport')
  })

  it('listDocumentModules includes ua_id_card', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_id_card')
  })

  it('listActiveModules does NOT include ua_international_passport (draft)', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('ua_international_passport')
  })

  it('listActiveModules does NOT include ua_id_card (draft)', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('ua_id_card')
  })

  it('getRegisteredDocumentTypes includes ua_international_passport', () => {
    expect(getRegisteredDocumentTypes()).toContain('ua_international_passport')
  })

  it('getRegisteredDocumentTypes includes ua_id_card', () => {
    expect(getRegisteredDocumentTypes()).toContain('ua_id_card')
  })
})

// ── Classifier alias table ────────────────────────────────────────────────────

describe('classifyDocumentType — international passport aliases', () => {
  const intlPassportAliases = [
    'ua_international_passport',
    'international_passport',
    'ua_intl_passport',
    'закордонний паспорт',
    'загранпаспорт',
    'закордонний паспорт україни',
  ]

  for (const alias of intlPassportAliases) {
    it(`resolves alias "${alias}" → ua_international_passport (canonicalType)`, () => {
      expect(classifyDocumentType(alias).canonicalType).toBe('ua_international_passport')
    })
  }

  it('classifyDocumentType usedFallback=true (draft routes to manual)', () => {
    const result = classifyDocumentType('ua_international_passport')
    expect(result.usedFallback).toBe(true)
    expect(result.module.documentType).toBe('manual_review_required')
  })

  it('resolveDocumentModule for ua_international_passport → manualReview (draft)', () => {
    const resolved = resolveDocumentModule('ua_international_passport')
    expect(resolved.documentType).toBe('manual_review_required')
  })
})

describe('classifyDocumentType — ua_id_card aliases', () => {
  const idCardAliases = [
    'ua_id_card',
    'id_card',
    'id card',
    'ukrainian id card',
    'посвідчення особи',
    'id-картка',
    'ідентифікаційна картка',
  ]

  for (const alias of idCardAliases) {
    it(`resolves alias "${alias}" → ua_id_card (canonicalType)`, () => {
      expect(classifyDocumentType(alias).canonicalType).toBe('ua_id_card')
    })
  }

  it('classifyDocumentType usedFallback=true (draft routes to manual)', () => {
    const result = classifyDocumentType('ua_id_card')
    expect(result.usedFallback).toBe(true)
    expect(result.module.documentType).toBe('manual_review_required')
  })

  it('resolveDocumentModule for ua_id_card → manualReview (draft)', () => {
    const resolved = resolveDocumentModule('ua_id_card')
    expect(resolved.documentType).toBe('manual_review_required')
  })
})
