import { describe, it, expect } from 'vitest'
import { getGeminiApiKey } from '../apiKey'
describe('getGeminiApiKey — tolerant of var name', () => {
  it('reads GEMINI_API_KEY2 (the name the owner used)', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY2: 'k2', GEMINI_API_KEY: 'dead' } as any)).toBe('k2')
  })
  it('reads GEMINI_API_KEY_066', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY_066: 'k066' } as any)).toBe('k066')
  })
  it('explicit PAY wins over others', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY_PAY: 'kpay', GEMINI_API_KEY2: 'k2' } as any)).toBe('kpay')
  })
  it('any suffixed GEMINI_API_KEY* is picked over the bare one', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY_NEW: 'knew', GEMINI_API_KEY: 'dead' } as any)).toBe('knew')
  })
  it('falls back to bare GEMINI_API_KEY', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY: 'only' } as any)).toBe('only')
  })
  it('empty when none set; ignores GEMINI_MODEL', () => {
    expect(getGeminiApiKey({ GEMINI_MODEL: 'x' } as any)).toBe('')
  })
})
