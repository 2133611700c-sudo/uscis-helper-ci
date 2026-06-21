import { describe, expect, it } from 'vitest'
import type { TPSAnswers } from '../answers'
import { checkReviewPayloadParity } from '../reviewParity'

const BASE: TPSAnswers = {
  family_name: 'Testenko',
  given_name: 'Ivan',
  dob: '1990-01-01',
  sex: 'M',
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  passport_number: 'FA000000',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date: '2030-01-01',
  us_address_street: '1213 Gordon St',
  us_address_city: 'Los Angeles',
  us_address_state: 'CA',
  us_address_zip: '90038',
  mailing_same_as_physical: true,
  last_entry_date: '2022-09-09',
  filing_path: 'initial',
  wants_ead: true,
  ead_category: 'c19',
  daytime_phone: '2133611700',
  email: 'test@example.com',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
  marital_status: 'single',
  part7_reviewed: true,
  city_of_birth: 'Vinnytsia',
  province_of_birth: 'Vinnytsia Oblast',
}

describe('checkReviewPayloadParity', () => {
  it('returns no mismatches when review snapshot matches payload', () => {
    const mismatches = checkReviewPayloadParity(BASE, {
      city_of_birth: 'Vinnytsia',
      province_of_birth: 'Vinnytsia Oblast',
    })
    expect(mismatches).toEqual([])
  })

  it('returns mismatch details when review and payload diverge', () => {
    const mismatches = checkReviewPayloadParity(BASE, {
      city_of_birth: 'Trostyanets',
      province_of_birth: 'VINNYTSKA OBL.',
    })
    expect(mismatches).toHaveLength(2)
    expect(mismatches.map((m) => m.field).sort()).toEqual(['city_of_birth', 'province_of_birth'])
  })
})

