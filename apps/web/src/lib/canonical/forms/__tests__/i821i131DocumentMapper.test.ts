/**
 * Parity tests for i821DocumentMapper + i131DocumentMapper.
 *
 * Phase 1 canonical single-currency: validates that the canonical mappers emit
 * the SAME document-derived ops as the legacy code they replaced, including all
 * Phase 2B defect fixes:
 *   - A-Number 9-digit normalization (maxLength=9, silent drop without fix)
 *   - I-131 gender widget inversion (Gender[0]=/F, Gender[1]=/M)
 *   - DOB ISO → MM/DD/YYYY date formatting
 *   - Absent fields produce NO op (not a blank text write)
 */
import { describe, it, expect } from 'vitest'
import { buildI821DocumentOps } from '../i821DocumentMapper'
import { i821DocumentFactsToCanonical } from '@/lib/tps/forms/i821DocumentBoundary'
import { buildI131DocumentOps } from '../i131DocumentMapper'
import { i131DocumentFactsToCanonical } from '@/lib/reparole/i131DocumentBoundary'
import type { TPSAnswers } from '@/lib/tps/answers'
import type { ReParoleAnswers } from '@/lib/reparole/answers'

// ── Minimal TPSAnswers fixture for I-821 document-derived parity ───────────
const tpsFixture: Pick<TPSAnswers,
  'family_name' | 'given_name' | 'middle_name' | 'dob' | 'sex' | 'a_number'
  | 'city_of_birth' | 'country_of_birth' | 'country_of_nationality'
  | 'passport_number' | 'passport_country_of_issuance' | 'passport_expiration_date'
  | 'i94_admission_number' | 'last_entry_date' | 'status_at_last_entry'
  | 'place_of_last_entry' | 'port_of_entry_city' | 'port_of_entry_state'
> = {
  family_name:                 'SAMPLEFAMILY',
  given_name:                  'SAMPLEGIVEN',
  middle_name:                 'SAMPLEMIDDLE',
  dob:                         '1990-06-15',
  sex:                         'M',
  a_number:                    'A012345678',     // "A"-prefixed — must become '012345678'
  city_of_birth:               'SAMPLECITY',
  country_of_birth:            'Ukraine',
  country_of_nationality:      'Ukraine',
  passport_number:             'PX0000001',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date:    '2030-12-31',
  i94_admission_number:        '12345678901',
  last_entry_date:             '2023-05-01',
  status_at_last_entry:        'PAROLE',
  place_of_last_entry:         'Los Angeles, CA',
  port_of_entry_city:          undefined,
  port_of_entry_state:         undefined,
}

describe('i821DocumentMapper', () => {
  it('emits legal name ops', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const getText = (field: string) => ops.find((o) => o.field === field && o.kind === 'text')?.value
    expect(getText('form1[0].Page01[0].Part2_Item1_FamilyName[0]')).toBe('SAMPLEFAMILY')
    expect(getText('form1[0].Page01[0].Part2_Item1_GivenName[0]')).toBe('SAMPLEGIVEN')
    expect(getText('form1[0].Page01[0].Part2_Item1_MiddleName[0]')).toBe('SAMPLEMIDDLE')
  })

  it('normalizes A-Number: strips "A" prefix → 9 digits (Phase 2B fix)', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const op = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item7_AlienNumber[0]')
    expect(op?.value).toBe('012345678')  // 9 digits, no "A"
  })

  it('formats DOB as MM/DD/YYYY', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const op = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item10_DateOfBirth[0]')
    expect(op?.value).toBe('06/15/1990')
  })

  it('emits sex checkboxes: M → Sex[0]=true, Sex[1]=false', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const maleOp   = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item12_Sex[0]')
    const femaleOp = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item12_Sex[1]')
    expect(maleOp?.value).toBe(true)
    expect(femaleOp?.value).toBe(false)
  })

  it('emits sex checkboxes: F → Sex[0]=false, Sex[1]=true', () => {
    const f: TPSAnswers = { ...tpsFixture, sex: 'F' } as TPSAnswers
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(f))
    const maleOp   = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item12_Sex[0]')
    const femaleOp = ops.find((o) => o.field === 'form1[0].Page02[0].Part2_Item12_Sex[1]')
    expect(maleOp?.value).toBe(false)
    expect(femaleOp?.value).toBe(true)
  })

  it('splits place_of_last_entry into port of entry city/state', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const city  = ops.find((o) => o.field === 'form1[0].Page03[0].Part2_Item20_CityOrTown[0]')
    const state = ops.find((o) => o.field === 'form1[0].Page03[0].Part2_Item20_State[0]')
    expect(city?.value).toBe('Los Angeles')
    expect(state?.value).toBe('CA')
  })

  it('port_of_entry_* overrides place_of_last_entry split', () => {
    const f = { ...tpsFixture, port_of_entry_city: 'Miami', port_of_entry_state: 'FL' } as TPSAnswers
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(f))
    const city  = ops.find((o) => o.field === 'form1[0].Page03[0].Part2_Item20_CityOrTown[0]')
    const state = ops.find((o) => o.field === 'form1[0].Page03[0].Part2_Item20_State[0]')
    expect(city?.value).toBe('Miami')
    expect(state?.value).toBe('FL')
  })

  it('absent sex emits no checkbox op', () => {
    const f = { ...tpsFixture, sex: undefined } as unknown as TPSAnswers
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(f))
    const sexOps = ops.filter((o) => o.field.includes('Part2_Item12_Sex'))
    expect(sexOps).toHaveLength(0)
  })

  it('absent A-Number emits no alien-number op', () => {
    const f = { ...tpsFixture, a_number: undefined } as unknown as TPSAnswers
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(f))
    const anOp = ops.find((o) => o.field.includes('AlienNumber'))
    expect(anOp).toBeUndefined()
  })

  it('formats passport expiration as MM/DD/YYYY', () => {
    const ops = buildI821DocumentOps(i821DocumentFactsToCanonical(tpsFixture as TPSAnswers))
    const op = ops.find((o) => o.field === 'form1[0].Page03[0].Part2_Item24_PassportExpiration[0]')
    expect(op?.value).toBe('12/31/2030')
  })
})

// ── Minimal ReParoleAnswers fixture for I-131 document-derived parity ──────
const reparoleFixture: Pick<ReParoleAnswers,
  'family_name' | 'given_name' | 'middle_name' | 'a_number' | 'dob' | 'sex'
  | 'country_of_birth' | 'country_of_nationality' | 'class_of_admission'
  | 'i94_admission_number' | 'mailing_street' | 'mailing_city' | 'mailing_state'
  | 'mailing_zip' | 'daytime_phone' | 'email'
> = {
  family_name:             'SAMPLEFAM',
  given_name:              'SAMPLEGIV',
  middle_name:             'SAMPLEMID',
  a_number:                'A-012-345-678',   // dashed "A"-prefixed — must become '012345678'
  dob:                     '1985-03-20',
  sex:                     'M',
  country_of_birth:        'Ukraine',
  country_of_nationality:  'Ukraine',
  class_of_admission:      'UH',
  i94_admission_number:    '98765432100',
  mailing_street:          '100 Sample St',
  mailing_city:            'Los Angeles',
  mailing_state:           'CA',
  mailing_zip:             '90001',
  daytime_phone:           '5550001111',
  email:                   'test@example.com',
}

describe('i131DocumentMapper', () => {
  it('emits legal name ops', () => {
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(reparoleFixture as ReParoleAnswers))
    const getText = (field: string) => ops.find((o) => o.field === field && o.kind === 'text')?.value
    expect(getText('form1[0].P4[0].Part2_Line1_FamilyName[0]')).toBe('SAMPLEFAM')
    expect(getText('form1[0].P4[0].Part2_Line1_GivenName[0]')).toBe('SAMPLEGIV')
    expect(getText('form1[0].P4[0].Part2_Line1_MiddleName[0]')).toBe('SAMPLEMID')
  })

  it('normalizes A-Number: strips "A-" and dashes → 9 digits (Phase 2B fix)', () => {
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(reparoleFixture as ReParoleAnswers))
    const op = ops.find((o) => o.field === 'form1[0].P5[0].#area[0].Part2_Line5_AlienNumber[0]')
    expect(op?.value).toBe('012345678')  // 9 digits, no "A-" or dashes
  })

  it('formats DOB as MM/DD/YYYY', () => {
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(reparoleFixture as ReParoleAnswers))
    const op = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line9_DateOfBirth[0]')
    expect(op?.value).toBe('03/20/1985')
  })

  it('sex=M targets Gender[1] (on-value=/M), NOT Gender[0] — gender inversion fix (Phase 2B)', () => {
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(reparoleFixture as ReParoleAnswers))
    const maleWidget   = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line8_Gender[1]')
    const femaleWidget = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line8_Gender[0]')
    expect(maleWidget?.value).toBe(true)   // /M widget checked
    expect(femaleWidget).toBeUndefined()    // /F widget NOT emitted (no forced false)
  })

  it('sex=F targets Gender[0] (on-value=/F), NOT Gender[1] — gender inversion fix', () => {
    const f: ReParoleAnswers = { ...reparoleFixture, sex: 'F' } as ReParoleAnswers
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(f))
    const femaleWidget = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line8_Gender[0]')
    const maleWidget   = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line8_Gender[1]')
    expect(femaleWidget?.value).toBe(true) // /F widget checked
    expect(maleWidget).toBeUndefined()     // /M widget NOT emitted
  })

  it('absent sex emits no gender op', () => {
    const f = { ...reparoleFixture, sex: undefined } as unknown as ReParoleAnswers
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(f))
    const genderOps = ops.filter((o) => o.field.includes('Line8_Gender'))
    expect(genderOps).toHaveLength(0)
  })

  it('emits class of admission and I-94 number', () => {
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(reparoleFixture as ReParoleAnswers))
    const classOp = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line12_ClassofAdmission[0]')
    const i94Op   = ops.find((o) => o.field === 'form1[0].P5[0].Part2_Line13_I94RecordNo[0]')
    expect(classOp?.value).toBe('UH')
    expect(i94Op?.value).toBe('98765432100')
  })

  it('absent A-Number emits no alien-number op', () => {
    const f = { ...reparoleFixture, a_number: undefined } as unknown as ReParoleAnswers
    const ops = buildI131DocumentOps(i131DocumentFactsToCanonical(f))
    const anOp = ops.find((o) => o.field.includes('AlienNumber'))
    expect(anOp).toBeUndefined()
  })
})
