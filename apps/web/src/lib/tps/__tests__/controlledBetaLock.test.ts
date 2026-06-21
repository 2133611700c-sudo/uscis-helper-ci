import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi, beforeEach } from 'vitest'

// Route-handler tests dynamically import the generate-packet API route which
// calls buildPacket → PDF read + integrity + prefill. Under full-suite
// parallel load, these spike well past 30 s.
vi.setConfig({ testTimeout: 120_000 })

import { isMinimallyComplete, type TPSAnswers } from '../answers'

const generateBlockPath = path.join(
  process.cwd(),
  'src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx',
)

function validAnswers(): TPSAnswers {
  return {
    family_name: 'TESTFAMILY',
    given_name: 'TESTGIVEN',
    middle_name: 'TESTMID',
    dob: '1980-01-15',
    sex: 'M',
    country_of_birth: 'Ukraine',
    country_of_nationality: 'Ukraine',
    passport_number: 'XX0000000',
    passport_country_of_issuance: 'Ukraine',
    passport_expiration_date: '2030-12-31',
    us_address_street: '100 Test St',
    us_address_city: 'Testville',
    us_address_state: 'CA',
    us_address_zip: '90001',
    mailing_same_as_physical: true,
    last_entry_date: '2023-05-01',
    i94_admission_number: '00000000001',
    filing_path: 'initial',
    wants_ead: true,
    ead_category: 'c19',  // initial = pending TPS → (c)(19)
    daytime_phone: '5550000000',
    email: 'test@example.invalid',
    has_criminal_concern: false,
    has_prior_tps_denial: false,
    left_us_without_advance_parole: false,
    marital_status: 'single',
    part7_reviewed: true,
  }
}

describe('T3PS controlled-beta regression lock', () => {
  it('Step 6 renders stable passport selectors', () => {
    const src = fs.readFileSync(generateBlockPath, 'utf-8')
    expect(src).toContain('data-testid="tps-passport-number-input"')
    expect(src).toContain('data-testid="tps-passport-expiration-input"')
  })

  it('generate payload includes passport_number and passport_expiration_date', () => {
    const src = fs.readFileSync(generateBlockPath, 'utf-8')
    expect(src).toMatch(/passport_number:\s*fields\.passport_number/)
    expect(src).toMatch(/passport_expiration_date:\s*fields\.passport_expiration_date/)
  })

  it('minimal completeness fails with 422-driving missing passport fields', () => {
    const answers = validAnswers()
    answers.passport_number = ''
    answers.passport_expiration_date = ''
    const check = isMinimallyComplete(answers)
    expect(check.ok).toBe(false)
    expect(check.missing).toContain('passport_number')
    expect(check.missing).toContain('passport_expiration_date')
  })
})

describe('generate-packet route status contract (422 vs 200)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('KV_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_URL', '')
  })

  // Entitlement is OWNER here (payment-only bypass). Previously these tests used
  // `x-payment-token: 'test'`, which only worked because of the #184 E5 fail-open
  // hole (a junk token reached generation). That bypass is now closed, so the
  // field-validation contract (422 vs 200) is reached via a legitimate owner
  // session instead — exactly the supported "owner skips payment, not the gate".
  it('returns 422 when required passport fields are missing', async () => {
    vi.doMock('@/lib/ownerAccess', () => ({ isOwnerSession: vi.fn(async () => ({ verified: true })) }))
    const { POST } = await import('@/app/api/tps/generate-packet/route')
    const req = new Request('http://localhost/api/tps/generate-packet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validAnswers(),
        passport_number: '',
        passport_expiration_date: '',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(422)
    const body = await res.json() as { missing?: string[] }
    expect(body.missing ?? []).toContain('passport_number')
    expect(body.missing ?? []).toContain('passport_expiration_date')
  })

  it('returns 200 when required passport fields are present', async () => {
    vi.doMock('@/lib/ownerAccess', () => ({ isOwnerSession: vi.fn(async () => ({ verified: true })) }))
    vi.doMock('@/lib/tps/packetBuilder', () => ({
      buildPacket: vi.fn(async () => ({
        zipBytes: new Uint8Array([80, 75, 3, 4]),
        i821: { applied: 1, skipped: 0, firstSkips: [] as string[] },
        i765: { applied: 0, skipped: 0, firstSkips: [] as string[] },
        auditSummary: null,
        translations: [],
      })),
    }))
    const { POST } = await import('@/app/api/tps/generate-packet/route')
    const req = new Request('http://localhost/api/tps/generate-packet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validAnswers()),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/zip/)
  })
})
