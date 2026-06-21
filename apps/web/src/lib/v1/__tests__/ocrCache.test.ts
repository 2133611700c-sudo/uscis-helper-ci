import { describe, it, expect } from 'vitest'
import { buildOcrCacheKey } from '../ocrCache'

const SHA = 'a'.repeat(64)
const parts = {
  fileSha256: SHA,
  provider: 'gemini',
  modelVersion: 'gemini-3.1-pro-preview',
  promptVersion: 'p7',
  preprocessingVersion: 'pre2',
}

describe('buildOcrCacheKey', () => {
  it('builds a deterministic key from all five parts', () => {
    const k = buildOcrCacheKey(parts)
    expect(k).toBe(`${SHA}:gemini:gemini-3.1-pro-preview:p7:pre2`)
    expect(buildOcrCacheKey(parts)).toBe(k) // deterministic
  })

  it('changes when prompt_version changes (no stale reuse across prompt changes)', () => {
    const a = buildOcrCacheKey(parts)
    const b = buildOcrCacheKey({ ...parts, promptVersion: 'p8' })
    expect(a).not.toBe(b)
  })

  it('changes when preprocessing_version changes', () => {
    expect(buildOcrCacheKey(parts)).not.toBe(buildOcrCacheKey({ ...parts, preprocessingVersion: 'pre3' }))
  })

  it('throws if any part is missing (no partial keys)', () => {
    for (const k of ['provider', 'modelVersion', 'promptVersion', 'preprocessingVersion'] as const) {
      expect(() => buildOcrCacheKey({ ...parts, [k]: '' })).toThrow(/ocr_cache_key_incomplete/)
    }
  })

  it('throws on a malformed sha256', () => {
    expect(() => buildOcrCacheKey({ ...parts, fileSha256: 'deadbeef' })).toThrow(/ocr_cache_key_invalid/)
  })
})

describe('buildOcrCacheKey — requestSha binding (different prompts never collapse)', () => {
  const REQ_A = 'b'.repeat(64)
  const REQ_B = 'c'.repeat(64)

  it('is backward-compatible: omitting requestSha yields the original 5-part key', () => {
    expect(buildOcrCacheKey(parts)).toBe(`${SHA}:gemini:gemini-3.1-pro-preview:p7:pre2`)
  })

  it('appends requestSha when present', () => {
    expect(buildOcrCacheKey({ ...parts, requestSha: REQ_A })).toBe(
      `${SHA}:gemini:gemini-3.1-pro-preview:p7:pre2:${REQ_A}`,
    )
  })

  it('same bytes+provider+model+version but DIFFERENT request → DIFFERENT key (no wrong collapse)', () => {
    const a = buildOcrCacheKey({ ...parts, requestSha: REQ_A })
    const b = buildOcrCacheKey({ ...parts, requestSha: REQ_B })
    expect(a).not.toBe(b)
  })

  it('identical request → identical key (correct collapse)', () => {
    expect(buildOcrCacheKey({ ...parts, requestSha: REQ_A })).toBe(
      buildOcrCacheKey({ ...parts, requestSha: REQ_A }),
    )
  })

  it('a key WITH requestSha never equals the same key WITHOUT it', () => {
    expect(buildOcrCacheKey({ ...parts, requestSha: REQ_A })).not.toBe(buildOcrCacheKey(parts))
  })

  it('throws on a blank or malformed requestSha (no silent weak binding)', () => {
    expect(() => buildOcrCacheKey({ ...parts, requestSha: '   ' })).toThrow(/ocr_cache_key_incomplete/)
    expect(() => buildOcrCacheKey({ ...parts, requestSha: 'deadbeef' })).toThrow(/ocr_cache_key_invalid/)
  })
})
