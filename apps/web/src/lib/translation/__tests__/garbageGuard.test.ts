/**
 * garbageGuard.test.ts — OCR label/garbage must never be shown as a recognized value.
 * Locks the live booklet failure: given_name "„ Пріз" must be rejected.
 */
import { describe, it, expect } from 'vitest'
import { classifyGarbage, isGarbageValue } from '@uscis-helper/knowledge'

describe('garbageGuard', () => {
  it('rejects the live failure value "„ Пріз" (quote + label fragment)', () => {
    const v = classifyGarbage('„ Пріз')
    expect(v.garbage).toBe(true)
    expect(v.reason).toBe('quote_prefix')
  })
  it('rejects a bare label as value', () => {
    expect(classifyGarbage('Прізвище').garbage).toBe(true)
    expect(classifyGarbage('Дата народження').garbage).toBe(true)
  })
  it('rejects empty / punctuation-only / too-short', () => {
    expect(classifyGarbage('').reason).toBe('empty')
    expect(classifyGarbage('—.,').reason).toBe('punctuation_only')
    expect(classifyGarbage('A').reason).toBe('too_short')
  })
  it('accepts real names/places', () => {
    expect(isGarbageValue('Шевченко')).toBe(false)
    expect(isGarbageValue('Vinnytsia')).toBe(false)
    expect(isGarbageValue('Ivan')).toBe(false)
  })
})
