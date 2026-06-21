/**
 * SUCCESS codec parity — PROVEN_LOCAL_RECORDED_FIXTURE.
 *
 * Proves the FULL cache pipeline preserves a successful provider result byte-for-
 * byte through: encode → encrypt → store → load → decrypt → decode → deep-equality.
 *
 * HONEST SCOPE: the input is a deterministic, PII-free SYNTHETIC recorded fixture
 * (no real applicant data, no live provider). It proves the codec+crypto math, NOT
 * a production provider response. A production SUCCESS proof requires a real
 * (quota-permitting) Vision/Gemini 200 and is tracked separately. Vision is
 * currently 429 (free-tier quota), so this fixture stands in for the success path.
 */
import { describe, it, expect } from 'vitest'
import {
  encodeOcrResult,
  decodeOcrResult,
  isCacheable,
  CodecError,
  type OcrCodecMeta,
  type OcrCodecRecord,
} from '../ocrResponseCodec'
import { ocrCacheKeyFromEnv, sealOcrValue, openOcrValue } from '../ocrCacheCrypto'
import type { OcrResult } from '../../ocr/types'

const META: OcrCodecMeta = {
  provider: 'google_vision',
  model: 'builtin/latest',
  prompt_version: 'v1',
  preproc_version: 'v1',
}

const KM = ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: 'c'.repeat(64), OCR_CACHE_KEY_VERSION: '1' })

// Deterministic, PII-FREE synthetic success fixture. Cyrillic text, bounding
// boxes, confidence present on some tokens + absent on others, warnings array,
// multi-page. Values are invented (not a real document).
const RECORDED: OcrResult = {
  provider: 'google_vision',
  raw_text: 'СВІДОЦТВО ПРО НАРОДЖЕННЯ\nЗразок Зразковий\nсмт Тестове',
  pages: [
    {
      page: 1,
      width: 1240,
      height: 1754,
      lines: [
        {
          id: 'l_001', text: 'СВІДОЦТВО ПРО НАРОДЖЕННЯ', page: 1, source: 'google_vision',
          bbox: { x: 0.1, y: 0.05, width: 0.8, height: 0.04 }, confidence: 0.98,
          words: [
            { id: 'w_0001', text: 'СВІДОЦТВО', page: 1, source: 'google_vision', bbox: { x: 0.1, y: 0.05, width: 0.25, height: 0.04 }, confidence: 0.99 },
            { id: 'w_0002', text: 'ПРО', page: 1, source: 'google_vision', bbox: { x: 0.37, y: 0.05, width: 0.08, height: 0.04 } /* no confidence */ },
            { id: 'w_0003', text: 'НАРОДЖЕННЯ', page: 1, source: 'google_vision', bbox: { x: 0.47, y: 0.05, width: 0.43, height: 0.04 }, confidence: 0.97 },
          ],
        },
      ],
      words: [
        { id: 'w_0001', text: 'СВІДОЦТВО', page: 1, source: 'google_vision', bbox: { x: 0.1, y: 0.05, width: 0.25, height: 0.04 }, confidence: 0.99 },
        { id: 'w_0002', text: 'ПРО', page: 1, source: 'google_vision', bbox: { x: 0.37, y: 0.05, width: 0.08, height: 0.04 } },
        { id: 'w_0003', text: 'НАРОДЖЕННЯ', page: 1, source: 'google_vision', bbox: { x: 0.47, y: 0.05, width: 0.43, height: 0.04 }, confidence: 0.97 },
      ],
    },
  ],
  lines: [
    {
      id: 'l_001', text: 'СВІДОЦТВО ПРО НАРОДЖЕННЯ', page: 1, source: 'google_vision',
      bbox: { x: 0.1, y: 0.05, width: 0.8, height: 0.04 }, confidence: 0.98, words: [],
    },
  ],
  words: [
    { id: 'w_0001', text: 'СВІДОЦТВО', page: 1, source: 'google_vision', bbox: { x: 0.1, y: 0.05, width: 0.25, height: 0.04 }, confidence: 0.99 },
  ],
  processing_ms: 842,
  warnings: ['low_dpi_region:footer', 'mixed_script_detected'],
  created_at: '2026-06-14T00:00:00.000Z',
}

/** The full production round-trip: encode → encrypt → store(JSON) → load → decrypt → decode. */
function roundTrip(result: OcrResult, meta: OcrCodecMeta): OcrResult {
  const record = encodeOcrResult(result, meta)
  const sealed = sealOcrValue(JSON.stringify(record), KM)      // encrypt
  const stored = JSON.stringify(sealed)                        // persist
  const loaded = JSON.parse(stored)                            // load
  const opened = openOcrValue(loaded, KM)                      // decrypt
  const record2 = JSON.parse(opened) as OcrCodecRecord         // back to record
  return decodeOcrResult(record2, meta)                        // decode
}

describe('SUCCESS codec parity (PROVEN_LOCAL_RECORDED_FIXTURE)', () => {
  it('isCacheable=true for the recorded success result', () => {
    expect(isCacheable(RECORDED)).toBe(true)
  })

  it('full encode→encrypt→store→load→decrypt→decode is DEEP-EQUAL to the original', () => {
    const out = roundTrip(RECORDED, META)
    expect(out).toEqual(RECORDED)
  })

  it('preserves Cyrillic/Unicode text exactly', () => {
    const out = roundTrip(RECORDED, META)
    expect(out.raw_text).toContain('СВІДОЦТВО ПРО НАРОДЖЕННЯ')
    expect(out.raw_text).toContain('смт Тестове')
  })

  it('preserves bounding boxes, confidence (present AND absent), and arrays', () => {
    const out = roundTrip(RECORDED, META)
    expect(out.pages[0].words[0].bbox).toEqual({ x: 0.1, y: 0.05, width: 0.25, height: 0.04 })
    expect(out.pages[0].words[0].confidence).toBe(0.99)
    expect('confidence' in out.pages[0].words[1]).toBe(false) // absent stays absent
    expect(out.warnings).toEqual(['low_dpi_region:footer', 'mixed_script_detected'])
  })

  it('encoding is DETERMINISTIC (same result → byte-identical record body)', () => {
    const a = encodeOcrResult(RECORDED, META)
    const b = encodeOcrResult(RECORDED, META)
    expect(a.result_json).toBe(b.result_json)
    expect(a.content_sha256).toBe(b.content_sha256)
  })
})

describe('FAIL-CLOSED decode (cache MISS, never a served value)', () => {
  it('future schema version → CodecError(schema_version_mismatch)', () => {
    const rec = encodeOcrResult(RECORDED, META)
    const future = { ...rec, schema_version: 999 }
    expect(() => decodeOcrResult(future, META)).toThrow(CodecError)
    expect(reason(() => decodeOcrResult(future, META))).toBe('schema_version_mismatch')
  })
  it('binding mismatch (different model/prompt/preproc) → CodecError(binding_mismatch)', () => {
    const rec = encodeOcrResult(RECORDED, META)
    expect(reason(() => decodeOcrResult(rec, { ...META, model: 'other' }))).toBe('binding_mismatch')
    expect(reason(() => decodeOcrResult(rec, { ...META, prompt_version: 'v2' }))).toBe('binding_mismatch')
  })
  it('tampered result_json (integrity) → CodecError(integrity_failure)', () => {
    const rec = encodeOcrResult(RECORDED, META)
    const corrupt = { ...rec, result_json: rec.result_json.replace('СВІДОЦТВО', 'EVIL') }
    expect(reason(() => decodeOcrResult(corrupt, META))).toBe('integrity_failure')
  })
  it('structurally corrupt record → CodecError(corrupt)', () => {
    expect(reason(() => decodeOcrResult({ nope: 1 }, META))).toBe('corrupt')
  })
})

describe('isCacheable — never cache a failure/empty as success', () => {
  it('rejects an empty result', () => {
    const empty: OcrResult = { ...RECORDED, raw_text: '', pages: [], lines: [], words: [] }
    expect(isCacheable(empty)).toBe(false)
    expect(() => encodeOcrResult(empty, META)).toThrow(CodecError)
    expect(reason(() => encodeOcrResult(empty, META))).toBe('not_cacheable')
  })
  it('rejects a provider-error shaped object', () => {
    expect(isCacheable({ ok: false, error_code: 'OCR_RATE_LIMITED' })).toBe(false)
  })
})

function reason(fn: () => unknown): string {
  try { fn() } catch (e) { return e instanceof CodecError ? e.reason : `other:${(e as Error).message}` }
  return 'no_throw'
}
