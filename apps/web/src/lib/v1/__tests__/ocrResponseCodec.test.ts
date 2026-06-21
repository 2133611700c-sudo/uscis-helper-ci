/**
 * ocrResponseCodec — P2 step B. Deterministic encode/decode + cacheable-guard +
 * fail-closed binding/integrity. Proves the owner's HARD RULES:
 *   - errors / empty are NEVER cacheable (isCacheable rejects)
 *   - round-trip is identity; encoding is deterministic (byte-identical)
 *   - schema/binding/integrity/corrupt → CodecError (fail-closed = cache miss)
 */
import { describe, it, expect } from 'vitest'
import {
  encodeOcrResult,
  decodeOcrResult,
  isCacheable,
  canonicalJson,
  shadowParityVerdict,
  CodecError,
  OCR_CODEC_SCHEMA_VERSION,
  type OcrCodecMeta,
  type OcrCodecRecord,
} from '../ocrResponseCodec'
import type { OcrResult, OcrProviderErrorResult, OcrBlockedResult } from '../../ocr/types'

const META: OcrCodecMeta = {
  provider: 'google_vision',
  model: 'v1',
  prompt_version: 'p1',
  preproc_version: 'pre1',
}

function goodResult(): OcrResult {
  return {
    provider: 'google_vision',
    raw_text: 'Іван Петренко 1990-01-01',
    pages: [{ page: 1, width: 1000, height: 700, lines: [], words: [] }],
    lines: [{ id: 'l_001', text: 'Іван Петренко', page: 1, bbox: { x: 0, y: 0, width: 1, height: 0.1 }, words: [], source: 'google_vision' }],
    words: [{ id: 'w_0001', text: 'Іван', page: 1, bbox: { x: 0, y: 0, width: 0.2, height: 0.1 }, source: 'google_vision' }],
    processing_ms: 123,
    warnings: [],
    created_at: '2026-06-14T00:00:00.000Z',
  }
}

function emptyResult(): OcrResult {
  return { provider: 'google_vision', raw_text: '', pages: [], lines: [], words: [], processing_ms: 5, warnings: ['No text detected in image'], created_at: '2026-06-14T00:00:00.000Z' }
}

const providerError: OcrProviderErrorResult = {
  provider_error: true,
  error: { ok: false, error_code: 'OCR_RATE_LIMITED', retryable: true, message: 'busy', detail: 'http_429_rate' },
}
const blocked: OcrBlockedResult = { blocked: true, reason: 'missing creds', required_env_vars: ['X'] }

describe('isCacheable — HARD RULE: never cache errors/empty/blocked', () => {
  it('accepts a genuine successful read with usable fields', () => {
    expect(isCacheable(goodResult())).toBe(true)
  })
  it('rejects an EMPTY result (no text, no words, no lines)', () => {
    expect(isCacheable(emptyResult())).toBe(false)
  })
  it('rejects a provider ERROR result (429/5xx/quota/billing/invalid)', () => {
    expect(isCacheable(providerError)).toBe(false)
    const codes = ['OCR_QUOTA_EXHAUSTED', 'OCR_BILLING_DISABLED', 'OCR_INVALID_RESPONSE', 'OCR_PROVIDER_UNAVAILABLE'] as const
    for (const c of codes) {
      expect(isCacheable({ provider_error: true, error: { ok: false, error_code: c, retryable: false, message: 'x' } })).toBe(false)
    }
  })
  it('rejects a BLOCKED (missing-creds) result', () => {
    expect(isCacheable(blocked)).toBe(false)
  })
  it('rejects non-objects / malformed shapes', () => {
    expect(isCacheable(null)).toBe(false)
    expect(isCacheable(undefined)).toBe(false)
    expect(isCacheable('string')).toBe(false)
    expect(isCacheable({})).toBe(false)
    expect(isCacheable({ provider: 'x', raw_text: 5 })).toBe(false)
  })
})

describe('encode → decode round-trip', () => {
  it('is identity for a successful result', () => {
    const rec = encodeOcrResult(goodResult(), META)
    const back = decodeOcrResult(rec, META)
    expect(back).toEqual(goodResult())
  })

  it('record binds provider/model/prompt/preproc + schema_version', () => {
    const rec = encodeOcrResult(goodResult(), META)
    expect(rec.schema_version).toBe(OCR_CODEC_SCHEMA_VERSION)
    expect(rec.provider).toBe('google_vision')
    expect(rec.model).toBe('v1')
    expect(rec.prompt_version).toBe('p1')
    expect(rec.preproc_version).toBe('pre1')
    expect(rec.content_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses to encode a non-cacheable (empty/error) result', () => {
    expect(() => encodeOcrResult(emptyResult(), META)).toThrow(CodecError)
    expect(() => encodeOcrResult(providerError, META)).toThrow(CodecError)
    try { encodeOcrResult(emptyResult(), META) } catch (e) { expect((e as CodecError).reason).toBe('not_cacheable') }
  })
})

describe('determinism', () => {
  it('same input → byte-identical result_json + content hash (encoded_at excluded)', () => {
    const a = encodeOcrResult(goodResult(), META, '2026-06-14T00:00:00.000Z')
    const b = encodeOcrResult(goodResult(), META, '2099-12-31T23:59:59.000Z')
    expect(a.result_json).toBe(b.result_json)
    expect(a.content_sha256).toBe(b.content_sha256)
    expect(a.encoded_at).not.toBe(b.encoded_at) // metadata differs, body identical
  })
  it('canonicalJson is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}')
  })
})

describe('decode — FAIL-CLOSED (mismatch/corrupt → CodecError = cache miss)', () => {
  it('schema_version mismatch → CodecError', () => {
    const rec = encodeOcrResult(goodResult(), META)
    const stale: OcrCodecRecord = { ...rec, schema_version: 999 }
    expect(() => decodeOcrResult(stale, META)).toThrow(CodecError)
    try { decodeOcrResult(stale, META) } catch (e) { expect((e as CodecError).reason).toBe('schema_version_mismatch') }
  })

  it('binding mismatch (provider/model/prompt/preproc) → CodecError', () => {
    const rec = encodeOcrResult(goodResult(), META)
    for (const m of [
      { ...META, provider: 'gemini' },
      { ...META, model: 'v2' },
      { ...META, prompt_version: 'p2' },
      { ...META, preproc_version: 'pre2' },
    ]) {
      try { decodeOcrResult(rec, m); throw new Error('should have thrown') }
      catch (e) { expect(e).toBeInstanceOf(CodecError); expect((e as CodecError).reason).toBe('binding_mismatch') }
    }
  })

  it('integrity failure (tampered result_json) → CodecError', () => {
    const rec = encodeOcrResult(goodResult(), META)
    const tampered: OcrCodecRecord = { ...rec, result_json: rec.result_json.replace('Іван', 'Mallory') }
    try { decodeOcrResult(tampered, META); throw new Error('should have thrown') }
    catch (e) { expect(e).toBeInstanceOf(CodecError); expect((e as CodecError).reason).toBe('integrity_failure') }
  })

  it('corrupt / unparseable record → CodecError', () => {
    expect(() => decodeOcrResult(null, META)).toThrow(CodecError)
    expect(() => decodeOcrResult({}, META)).toThrow(CodecError)
    expect(() => decodeOcrResult({ schema_version: 1, provider: 'google_vision' }, META)).toThrow(CodecError)
    // valid record shape but result_json is not JSON
    const rec = encodeOcrResult(goodResult(), META)
    const badJson: OcrCodecRecord = { ...rec, result_json: '{not json', content_sha256: rec.content_sha256 }
    // tamper content hash to match so we reach the JSON.parse failure path
    const { createHash } = require('node:crypto')
    badJson.content_sha256 = createHash('sha256').update('{not json').digest('hex')
    try { decodeOcrResult(badJson, META); throw new Error('should have thrown') }
    catch (e) { expect(e).toBeInstanceOf(CodecError); expect((e as CodecError).reason).toBe('corrupt') }
  })
})

describe('shadowParityVerdict — PII-free verdict only', () => {
  it('match when cached record equals live', () => {
    const rec = encodeOcrResult(goodResult(), META)
    expect(shadowParityVerdict(rec, goodResult(), META)).toBe('match')
  })
  it('mismatch when live differs', () => {
    const rec = encodeOcrResult(goodResult(), META)
    const live = { ...goodResult(), raw_text: 'DIFFERENT TEXT XYZ' }
    expect(shadowParityVerdict(rec, live, META)).toBe('mismatch')
  })
  it('mismatch when cached record fails decode (binding) — fail-closed', () => {
    const rec = encodeOcrResult(goodResult(), META)
    expect(shadowParityVerdict(rec, goodResult(), { ...META, model: 'v2' })).toBe('mismatch')
  })
})
