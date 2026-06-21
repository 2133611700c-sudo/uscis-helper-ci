/**
 * DL module fixture tests.
 *
 * Two scopes:
 *
 *  1. Upright California-DL text produces the AAMVA anchor fields PLUS
 *     all four us_address_* parts. This is the happy path the wizard
 *     relies on for auto-filling the Step 5 address.
 *
 *  2. Rotated/garbled DL text produces FEW or NO fields and crucially
 *     no us_address_street. This locks the contract that the route-level
 *     DL rotation retry (apps/web/src/app/api/tps/ocr/extract/route.ts,
 *     FIX_TPS_DL_ROTATION_AND_ADDRESS_EXTRACTION 2026-05-21) uses to
 *     decide when to re-OCR at 90/180/270. If runDlModule ever stops
 *     emitting us_address_street on degraded input, the route-level
 *     trigger predicate `dlHasAddressStreet()` becomes a tautology and
 *     we re-introduce the silent-no-address bug.
 *
 * No real PII. Address and DL number are synthetic.
 */

import { describe, it, expect } from 'vitest'
import { runDlModule } from '../dl'
import type { OcrResult, OcrLine } from '@/lib/ocr/types'

function makeOcr(text: string): OcrResult {
  const lines = text.split('\n').map((t, i): OcrLine => ({
    id: `l_${i.toString().padStart(4, '0')}`,
    text: t,
    page: 1,
    bbox: { x: 0.05, y: 0.05 + i * 0.05, width: 0.9, height: 0.04 },
    words: [],
    confidence: 0.95,
    source: 'google_vision',
  }))
  return {
    provider: 'google_vision',
    raw_text: text,
    pages: [{ page: 1, width: 1000, height: 700, lines, words: [] }],
    lines,
    words: [],
    processing_ms: 100,
    warnings: [],
    created_at: new Date().toISOString(),
  }
}

describe('runDlModule — upright DL text', () => {
  // Synthetic California DL — labels in the order Google Vision typically
  // tokenizes them. AAMVA layout.
  const upright = makeOcr(
    [
      'CALIFORNIA',
      'DRIVER LICENSE',
      'DL X1234567',
      'LN DOE',
      'FN JANE A',
      '123 MAIN ST APT 4',
      'LOS ANGELES, CA 90029',
      'DOB 01/15/1980',
      'SEX F',
      'HGT 5\'-04"',
      'WGT 130 lb',
      'EYES BRN',
      'HAIR BLK',
    ].join('\n'),
  )

  const result = runDlModule(upright, { document_id: 'doc_test_upright' })

  it('matches and emits all 4 address parts', () => {
    expect(result.matched).toBe(true)
    const keys = result.fields.map((f) => f.field)
    expect(keys).toContain('us_address_street')
    expect(keys).toContain('us_address_city')
    expect(keys).toContain('us_address_state')
    expect(keys).toContain('us_address_zip')
  })

  it('marks every address part requires_review=true (DL not identity-authoritative)', () => {
    for (const k of ['us_address_street', 'us_address_city', 'us_address_state', 'us_address_zip']) {
      const fx = result.fields.find((f) => f.field === k)
      expect(fx?.review_required, `${k} should require review`).toBe(true)
    }
  })

  it('extracts DL number, dob, sex from labelled anchors', () => {
    const dl = result.fields.find((f) => f.field === 'dl_number')
    const dob = result.fields.find((f) => f.field === 'dob')
    const sex = result.fields.find((f) => f.field === 'sex')
    expect(dl?.normalized_value).toBe('X1234567')
    expect(dob?.normalized_value).toBe('1980-01-15')
    expect(sex?.normalized_value).toBe('F')
  })
})

describe('runDlModule — rotated/garbled OCR (locks the route-level rotation trigger)', () => {
  // This is what Google Vision returns when a DL photo is rotated 90° — the
  // AAMVA labels are split across columns / read in wrong order so the
  // anchor regexes don't bind. We expect fewer than 3 fields AND no
  // us_address_street so the route-level retry fires.
  const rotated = makeOcr(
    [
      'A 4 LICENSE D',
      'IRO V E R',
      'L I A I L F O E',
      'NAC',
      '20 6029 90',
      '7 6 5 4 3 2 1 X LD',
      '0102/0150/01',
    ].join('\n'),
  )

  const result = runDlModule(rotated, { document_id: 'doc_test_rotated' })

  it('does NOT emit us_address_street on rotated input', () => {
    const hasStreet = result.fields.some((f) => f.field === 'us_address_street')
    expect(hasStreet).toBe(false)
  })

  it('triggers the route-level rotation retry predicate (matched=false OR no address)', () => {
    // The route uses `!(matched && hasAddressStreet)` to decide whether
    // to retry at 90/180/270. Confirm this fixture trips that condition.
    const hasStreet = result.fields.some((f) => f.field === 'us_address_street')
    const triggersRetry = !(result.matched && hasStreet)
    expect(triggersRetry).toBe(true)
  })
})

describe('runDlModule — upright DL WITHOUT visible address (edge case)', () => {
  // User uploaded a DL crop that includes the labels but the address area
  // is cut off. Module matches on AAMVA anchors but the rotation retry
  // should still trigger because address is the slot's primary product
  // value — we'd rather try other angles than ship an incomplete result.
  const noAddr = makeOcr(
    [
      'CALIFORNIA',
      'DRIVER LICENSE',
      'DL Y9876543',
      'LN SMITH',
      'FN JOHN',
      'DOB 05/05/1975',
      'SEX M',
    ].join('\n'),
  )

  const result = runDlModule(noAddr, { document_id: 'doc_test_no_addr' })

  it('still matches because >= 3 AAMVA anchors are present', () => {
    expect(result.matched).toBe(true)
  })

  it('produces NO us_address_street so the retry predicate still fires', () => {
    expect(result.fields.some((f) => f.field === 'us_address_street')).toBe(false)
    const triggersRetry = !(result.matched && result.fields.some((f) => f.field === 'us_address_street'))
    expect(triggersRetry).toBe(true)
  })
})
