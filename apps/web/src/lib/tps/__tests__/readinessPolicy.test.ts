import { describe, it, expect } from 'vitest'
import {
  requiredFieldKeys,
  requiredFieldsWithLabels,
  recommendedFieldsWithLabels,
} from '../readinessPolicy'

/**
 * Behaviour-pinning snapshot for the readinessPolicy consolidation (2026-05-27).
 *
 * These literal sets are the EXACT field lists the three gates required before
 * consolidation (centralBrain.REQUIRED_FOR_GENERATE, isMinimallyComplete,
 * mailReadyGate.REQUIRED_FIELDS/RECOMMENDED_FIELDS). The gates now derive from
 * the policy, so these tests are the anti-drift guard: if the policy changes,
 * a test fails and forces a CONSCIOUS update here — no silent divergence.
 */

// centralBrain.REQUIRED_FOR_GENERATE (historical)
const MERGE = [
  'family_name', 'given_name', 'dob', 'sex',
  'passport_number', 'passport_expiration_date',
  'country_of_nationality',
  'last_entry_date', 'status_at_last_entry',
]

// isMinimallyComplete base list (historical) — without conditional ead_category
const GENERATE_BASE = [
  'family_name', 'given_name', 'dob', 'sex',
  'country_of_birth', 'country_of_nationality',
  'passport_number', 'passport_country_of_issuance', 'passport_expiration_date',
  'us_address_street', 'us_address_city', 'us_address_state', 'us_address_zip',
  'last_entry_date', 'filing_path',
  'daytime_phone', 'email',
  'marital_status', 'part7_reviewed',
]

// mailReadyGate.REQUIRED_FIELDS (historical) + part7_reviewed (dedicated block)
const MAIL = [
  'family_name', 'given_name', 'dob', 'sex',
  'country_of_birth', 'country_of_nationality',
  'passport_number', 'passport_expiration_date',
  'us_address_street', 'us_address_city', 'us_address_state', 'us_address_zip',
  'daytime_phone', 'email',
  'last_entry_date', 'filing_path', 'marital_status',
  'part7_reviewed',
]

// mailReadyGate.RECOMMENDED_FIELDS (historical)
const MAIL_RECOMMENDED = [
  'middle_name', 'a_number', 'i94_admission_number',
  'city_of_birth', 'province_of_birth', 'status_at_last_entry', 'ssn',
]

describe('readinessPolicy — single source of truth for required fields', () => {
  it('merge stage matches centralBrain historical REQUIRED_FOR_GENERATE', () => {
    expect(new Set(requiredFieldKeys('merge'))).toEqual(new Set(MERGE))
  })

  it('generate stage (no EAD) matches isMinimallyComplete base list', () => {
    expect(new Set(requiredFieldKeys('generate', { wants_ead: false }))).toEqual(
      new Set(GENERATE_BASE),
    )
  })

  it('generate stage includes ead_category only when wants_ead is true', () => {
    expect(requiredFieldKeys('generate', { wants_ead: false })).not.toContain('ead_category')
    expect(requiredFieldKeys('generate', { wants_ead: true })).toContain('ead_category')
  })

  it('mail required matches mailReadyGate historical list', () => {
    expect(new Set(requiredFieldsWithLabels('mail').map((f) => f.key))).toEqual(new Set(MAIL))
  })

  it('mail recommended matches mailReadyGate historical RECOMMENDED_FIELDS', () => {
    expect(new Set(recommendedFieldsWithLabels('mail').map((f) => f.key))).toEqual(
      new Set(MAIL_RECOMMENDED),
    )
  })

  it('every required/recommended field carries a non-empty human label', () => {
    for (const stage of ['merge', 'generate', 'mail'] as const) {
      for (const f of requiredFieldsWithLabels(stage)) {
        expect(f.label.length).toBeGreaterThan(0)
      }
    }
    for (const f of recommendedFieldsWithLabels('mail')) {
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  it('KNOWN INCONSISTENCY [KI-1]: status_at_last_entry required at merge, only recommended at mail', () => {
    expect(requiredFieldKeys('merge')).toContain('status_at_last_entry')
    expect(requiredFieldsWithLabels('mail').map((f) => f.key)).not.toContain('status_at_last_entry')
    expect(recommendedFieldsWithLabels('mail').map((f) => f.key)).toContain('status_at_last_entry')
  })
})
