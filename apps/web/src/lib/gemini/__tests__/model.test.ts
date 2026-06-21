import { describe, expect, it } from 'vitest'

import { normalizeGeminiModel } from '../model'

describe('normalizeGeminiModel', () => {
  it('trims trailing newline from env-provided model ids', () => {
    expect(normalizeGeminiModel('gemini-2.5-flash\n', 'fallback-model')).toBe('gemini-2.5-flash')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeGeminiModel('  gemini-3.5-flash  ', 'fallback-model')).toBe('gemini-3.5-flash')
  })

  it('falls back when value is empty after trim', () => {
    expect(normalizeGeminiModel(' \n\t ', 'fallback-model')).toBe('fallback-model')
  })

  it('falls back when value is missing', () => {
    expect(normalizeGeminiModel(undefined, 'fallback-model')).toBe('fallback-model')
  })
})

