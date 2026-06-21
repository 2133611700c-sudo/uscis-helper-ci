import { describe, it, expect } from 'vitest'
import {
  validateStagingEnv,
  assertNotProductionTarget,
  referencesProduction,
  REQUIRED_STAGING_ENV,
} from '../stagingContract'

const goodEnv = {
  STAGING_SUPABASE_URL: 'https://stagingproj.supabase.co',
  STAGING_SUPABASE_SERVICE_ROLE_KEY: 'staging-service-role-key',
  STAGING_APP_URL: 'https://staging.example.vercel.app',
  STRIPE_TEST_MODE: 'test',
  STAGING_OCR_PROVIDER_KEY: 'staging-ocr-key',
}

describe('validateStagingEnv — fail-closed', () => {
  it('passes a complete staging env with no production references', () => {
    expect(validateStagingEnv(goodEnv)).toEqual({ ok: true, errors: [] })
  })

  it('fails when any required var is missing', () => {
    const env = { ...goodEnv }
    delete (env as Record<string, string | undefined>).STAGING_SUPABASE_URL
    const r = validateStagingEnv(env)
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('missing_required_env:STAGING_SUPABASE_URL')
  })

  it('fails when STRIPE_TEST_MODE is not "test"', () => {
    const r = validateStagingEnv({ ...goodEnv, STRIPE_TEST_MODE: 'live' })
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('stripe_test_mode_must_be_test')
  })

  it('rejects a staging value that references the production host', () => {
    const r = validateStagingEnv({ ...goodEnv, STAGING_APP_URL: 'https://messenginfo.com' })
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('staging_value_references_production:STAGING_APP_URL')
  })

  it('rejects a staging value that references the production Supabase ref', () => {
    const r = validateStagingEnv({ ...goodEnv, STAGING_SUPABASE_URL: 'https://rtfxrlountkoegsseukx.supabase.co' })
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('staging_value_references_production:STAGING_SUPABASE_URL')
  })

  it('rejects a live Stripe key in a staging slot', () => {
    const r = validateStagingEnv({ ...goodEnv, STAGING_OCR_PROVIDER_KEY: 'sk_live_abc' })
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('staging_value_references_production:STAGING_OCR_PROVIDER_KEY')
  })
})

describe('assertNotProductionTarget — production-target rejection', () => {
  it('throws for the production host', () => {
    expect(() => assertNotProductionTarget('https://messenginfo.com/api/healthz', 'benchmark')).toThrow(/staging_contract_violation/)
  })
  it('throws for the production Supabase ref', () => {
    expect(() => assertNotProductionTarget('postgres://db.rtfxrlountkoegsseukx.supabase.co')).toThrow()
  })
  it('does not throw for a staging target', () => {
    expect(() => assertNotProductionTarget('https://staging.example.vercel.app')).not.toThrow()
  })
})

describe('referencesProduction', () => {
  it('is case-insensitive and handles empty', () => {
    expect(referencesProduction('HTTPS://MESSENGINFO.COM')).toBe(true)
    expect(referencesProduction('')).toBe(false)
    expect(referencesProduction(undefined)).toBe(false)
  })
  it('REQUIRED_STAGING_ENV lists all staging-scoped vars', () => {
    expect(REQUIRED_STAGING_ENV.length).toBeGreaterThanOrEqual(5)
  })
})
