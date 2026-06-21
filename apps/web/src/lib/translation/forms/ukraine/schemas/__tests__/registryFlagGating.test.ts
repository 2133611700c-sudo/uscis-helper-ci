/**
 * registryFlagGating.test.ts — passport schemas are now REGISTERED unconditionally
 * (2026-06-12). The PASSPORT_SCHEMA_RENDERER_ENABLED staging flag is retired: all 9
 * official schemas resolve regardless of env. This test pins that the 3 passport
 * docTypes resolve (the migration's "live switch" is now permanent) and that the
 * flag no longer gates anything.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { hasOfficialSchema, getOfficialSchema, officialSchemaDocTypes } from '../registry'

const PASSPORTS = ['ua_internal_passport_booklet', 'ua_international_passport', 'ua_id_card']
const CERTIFICATES = [
  'ua_birth_certificate', 'ua_marriage_certificate', 'ua_divorce_certificate',
  'ua_death_certificate', 'ua_name_change_certificate', 'ua_military_id',
]
const ALL = [...CERTIFICATES, ...PASSPORTS]

afterEach(() => vi.unstubAllEnvs())

describe('official schema registry — passports registered unconditionally', () => {
  it('all 9 schemas resolve with the flag absent', () => {
    vi.stubEnv('PASSPORT_SCHEMA_RENDERER_ENABLED', '')
    for (const d of ALL) {
      expect(hasOfficialSchema(d), d).toBe(true)
      expect(getOfficialSchema(d)?.docType).toBe(d)
    }
    expect(officialSchemaDocTypes().sort()).toEqual([...ALL].sort())
  })

  it('the retired flag no longer changes resolution (on or off)', () => {
    for (const v of ['', '0', '1', 'true']) {
      vi.stubEnv('PASSPORT_SCHEMA_RENDERER_ENABLED', v)
      for (const d of PASSPORTS) expect(hasOfficialSchema(d), `${d} value=${v}`).toBe(true)
    }
  })

  it('an unknown docType still resolves to null', () => {
    expect(getOfficialSchema('ua_unknown')).toBeNull()
    expect(hasOfficialSchema(null)).toBe(false)
  })
})
