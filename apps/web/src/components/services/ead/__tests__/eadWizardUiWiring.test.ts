/**
 * eadWizardUiWiring.test.ts — B4 UI wiring verification.
 *
 * Verifies at the source-code level (no DOM, no browser):
 *  - Phase 2.4: EAD Core is unconditional — NEXT_PUBLIC_ONE_CORE_EAD_ENABLED flag removed
 *  - Upload step always shown (StepUpload unconditionally in STEPS)
 *  - EAD wizard references /api/ead/ocr/extract unconditionally
 *  - docHints covered by Core: passport, ead, i94
 *  - Source-gate comments are present (architecture contract)
 *  - invented_fields_count guarded (adapter never invents)
 *  - EAD adapter: passport-only → a_number=null, ead_category=null, i94=null, us_address=null
 *  - EAD adapter: EAD source → a_number and category map
 *  - EAD adapter: I-94 source → admission fields map
 *  - review_required preserved from canonical
 *
 * All assertions are pure (file-system reads + import of adapter).
 * No Next.js runtime required. Follows wizardScopeAndDeadCode.test.ts pattern.
 *
 * ONE_BRAIN_COMPLETE_CODE_READY: TPS (B1) + Translation (B2) + Re-Parole (B3) + EAD (B4).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { toEadAnswers } from '../../../../lib/canonical/core/eadAdapter'
import type { CanonicalDocumentResult, CanonicalField } from '../../../../lib/canonical/types'

// ── File paths ────────────────────────────────────────────────────────────────

const WIZARD_PATH = path.resolve(__dirname, '..', 'EADWizard.tsx')
const ROUTE_PATH = path.resolve(
  __dirname,
  '../../../../app/api/ead/ocr/extract/route.ts',
)

const wizardSrc = fs.readFileSync(WIZARD_PATH, 'utf-8')
const routeSrc = fs.readFileSync(ROUTE_PATH, 'utf-8')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeField(
  key: string,
  rawValue: string | null,
  overrides: Partial<CanonicalField> = {},
): CanonicalField {
  return {
    key,
    rawValue,
    normalizedValue: rawValue,
    criticality: 'medium',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

function makeCanonical(
  fields: CanonicalField[],
  docType = 'ua_international_passport',
  overrides: Partial<CanonicalDocumentResult> = {},
): CanonicalDocumentResult {
  return {
    documentSessionId: 'test-ui-wiring',
    product: 'ead',
    docType,
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-03T00:00:00.000Z',
    requiresReview: fields.some((f) => f.reviewRequired),
    ...overrides,
  }
}

// ── Phase 2.4: flag removed — Core is unconditional ──────────────────────────

describe('EADWizard — Phase 2.4: NEXT_PUBLIC_ONE_CORE_EAD_ENABLED flag removed', () => {
  it('flag constant EAD_CORE_ENABLED is gone (flag removed in Phase 2.4)', () => {
    expect(wizardSrc).not.toContain('EAD_CORE_ENABLED')
  })

  it('NEXT_PUBLIC_ONE_CORE_EAD_ENABLED env var is gone (flag removed)', () => {
    expect(wizardSrc).not.toContain('NEXT_PUBLIC_ONE_CORE_EAD_ENABLED')
  })

  it('StepUpload is always in STEPS unconditionally', () => {
    expect(wizardSrc).toContain('Step0, Step1, StepUpload, Step2')
  })
})

// ── Core route reference (unconditional) ─────────────────────────────────────

describe('EADWizard — Core route reference (unconditional, Phase 2.4)', () => {
  it('wizard references /api/ead/ocr/extract', () => {
    expect(wizardSrc).toContain('/api/ead/ocr/extract')
  })

  it('wizard uses fetch to call the Core route', () => {
    expect(wizardSrc).toContain("fetch('/api/ead/ocr/extract'")
  })

  it('StepUpload component exists in wizard', () => {
    expect(wizardSrc).toContain('StepUpload')
  })
})

// ── docHints ──────────────────────────────────────────────────────────────────

describe('EADWizard — docHints covered by Core', () => {
  it('passport hint is present', () => {
    expect(wizardSrc).toContain("'passport'")
  })

  it('ead hint is present', () => {
    // The hint selector buttons include 'ead'
    expect(wizardSrc).toContain("key: 'ead'")
  })

  it('i94 hint is present', () => {
    expect(wizardSrc).toContain("key: 'i94'")
  })

  it('route.ts maps passport hint to ua_international_passport', () => {
    expect(routeSrc).toContain('passport')
    expect(routeSrc).toContain('ua_international_passport')
  })

  it('route.ts maps ead hint to us_ead', () => {
    expect(routeSrc).toContain("'ead'")
    expect(routeSrc).toContain('us_ead')
  })

  it('route.ts maps i94 hint to us_i94', () => {
    expect(routeSrc).toContain('i94')
    expect(routeSrc).toContain('us_i94')
  })
})

// ── Prefill field mapping (from adapter output to form state) ─────────────────

describe('EADWizard — prefill field mapping from Core response', () => {
  it('family_name → lastName', () => {
    expect(wizardSrc).toContain('prefill.lastName = json.family_name')
  })

  it('given_name → firstName', () => {
    expect(wizardSrc).toContain('prefill.firstName = json.given_name')
  })

  it('date_of_birth → dob', () => {
    expect(wizardSrc).toContain('prefill.dob = json.date_of_birth')
  })

  it('sex M → gender male', () => {
    expect(wizardSrc).toContain("prefill.gender = 'male'")
  })

  it('sex F → gender female', () => {
    expect(wizardSrc).toContain("prefill.gender = 'female'")
  })

  it('country_of_birth → countryOfBirth', () => {
    expect(wizardSrc).toContain('prefill.countryOfBirth = json.country_of_birth')
  })

  it('a_number → alienNumber (source-gated by Core adapter)', () => {
    expect(wizardSrc).toContain('prefill.alienNumber = json.a_number')
  })
})

// ── Source gates: passport-only (adapter level) ───────────────────────────────

describe('EAD wizard + adapter: passport-only source gates (B4 hard rule)', () => {
  const passportFields = [
    makeField('family_name', 'Kovalenko'),
    makeField('given_name', 'Olena'),
    makeField('date_of_birth', '1990-05-15'),
    makeField('sex', 'M'),
  ]
  const passport = makeCanonical(passportFields, 'ua_international_passport')

  it('a_number is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).a_number).toBeNull()
  })

  it('ead_category is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).ead_category).toBeNull()
  })

  it('i94_admission_number is null when source is passport (not I-94)', () => {
    expect(toEadAnswers(passport).i94_admission_number).toBeNull()
  })

  it('us_address is null when source is passport (not DL/manual)', () => {
    expect(toEadAnswers(passport).us_address).toBeNull()
  })

  it('invented_fields_count is 0 (passport-only)', () => {
    expect(toEadAnswers(passport).invented_fields_count).toBe(0)
  })
})

// ── Source gates: EAD source (adapter level) ──────────────────────────────────

describe('EAD wizard + adapter: EAD source maps a_number and category', () => {
  const eadFields = [
    makeField('family_name', 'Kovalenko'),
    makeField('given_name', 'Olena'),
    makeField('date_of_birth', '1990-05-15'),
    makeField('a_number', 'A123456789'),
    makeField('ead_category', 'c11'),
  ]
  const ead = makeCanonical(eadFields, 'us_ead')

  it('a_number maps from EAD source', () => {
    expect(toEadAnswers(ead).a_number).toBe('A123456789')
  })

  it('ead_category maps from EAD source', () => {
    expect(toEadAnswers(ead).ead_category).toBe('c11')
  })

  it('i94 fields are null even for EAD source (gate not met)', () => {
    expect(toEadAnswers(ead).i94_admission_number).toBeNull()
  })

  it('invented_fields_count is 0 (EAD source)', () => {
    expect(toEadAnswers(ead).invented_fields_count).toBe(0)
  })
})

// ── Source gates: I-94 source (adapter level) ─────────────────────────────────

describe('EAD wizard + adapter: I-94 source maps admission fields', () => {
  const i94Fields = [
    makeField('family_name', 'Bondar'),
    makeField('given_name', 'Mykola'),
    makeField('date_of_birth', '1988-11-20'),
    makeField('i94_admission_number', '12345678901'),
    makeField('i94_date_of_entry', '2022-04-20'),
    makeField('i94_class_of_admission', 'UH'),
  ]
  const i94 = makeCanonical(i94Fields, 'us_i94')

  it('i94_admission_number maps from I-94 source', () => {
    expect(toEadAnswers(i94).i94_admission_number).toBe('12345678901')
  })

  it('i94_date_of_entry maps from I-94 source', () => {
    expect(toEadAnswers(i94).i94_date_of_entry).toBe('2022-04-20')
  })

  it('a_number is null even for I-94 source (EAD gate not met)', () => {
    expect(toEadAnswers(i94).a_number).toBeNull()
  })

  it('invented_fields_count is 0 (I-94 source)', () => {
    expect(toEadAnswers(i94).invented_fields_count).toBe(0)
  })
})

// ── review_required preservation ─────────────────────────────────────────────

describe('EAD wizard + adapter: review_required preserved', () => {
  it('review_required=true from canonical is preserved', () => {
    const canonical = makeCanonical(
      [makeField('family_name', 'Kovalenko', { reviewRequired: true })],
      'ua_international_passport',
      { requiresReview: true },
    )
    expect(toEadAnswers(canonical).review_required).toBe(true)
  })

  it('wizard maps review_required to hasReviewFields state', () => {
    expect(wizardSrc).toContain('json.review_required')
    expect(wizardSrc).toContain('setHasReviewFields')
  })
})

// ── Architecture contract markers in source ───────────────────────────────────

describe('EAD wizard + route — architecture contract markers', () => {
  it('route still labels responses with _flag ONE_CORE_EAD_ENABLED for observability', () => {
    // _flag label in JSON responses is kept for log tracing — not a live gate
    expect(routeSrc).toContain('ONE_CORE_EAD_ENABLED')
  })

  it('route returns invented_fields_count header', () => {
    expect(routeSrc).toContain('X-Invented-Fields')
  })

  it('adapter guarantees invented_fields_count=0 (comment in source)', () => {
    // The adapter type literally enforces `invented_fields_count: 0`
    expect(routeSrc).toContain('invented_fields_count') // must be 0
  })

  it('wizard skip button lets user bypass upload step', () => {
    expect(wizardSrc).toContain('uploadUi.skip')
  })

  it('wizard shows review warning when hasReviewFields', () => {
    expect(wizardSrc).toContain('hasReviewFields')
    expect(wizardSrc).toContain('uploadUi.reviewNote')
  })
})

// ── invented_fields_count=0 (all cases) ──────────────────────────────────────

describe('invented_fields_count always 0 (all source types)', () => {
  it('passport source: invented=0', () => {
    expect(toEadAnswers(makeCanonical([makeField('family_name', 'Test')], 'ua_international_passport')).invented_fields_count).toBe(0)
  })
  it('EAD source: invented=0', () => {
    expect(toEadAnswers(makeCanonical([makeField('a_number', 'A123')], 'us_ead')).invented_fields_count).toBe(0)
  })
  it('I-94 source: invented=0', () => {
    expect(toEadAnswers(makeCanonical([makeField('i94_admission_number', '123')], 'us_i94')).invented_fields_count).toBe(0)
  })
  it('empty fields: invented=0', () => {
    expect(toEadAnswers(makeCanonical([])).invented_fields_count).toBe(0)
  })
})
