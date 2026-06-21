import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRIMARY_READER, FALLBACK_MODELS, SANCTIONED_CHAIN, DEPRECATED_MODELS,
  isPrimaryReader, isSanctionedModel, acceptanceModelVerdict, assertPrimaryReader, isDisqualifiedFor,
} from '../modelMatrix'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'

const __dir = dirname(fileURLToPath(import.meta.url))
const PROVIDER_SRC = readFileSync(resolve(__dir, '../providers/geminiVisionProvider.ts'), 'utf8')

describe('modelMatrix — the ADR-018 law in code', () => {
  it('primary reader is gemini-3.1-pro-preview', () => {
    expect(PRIMARY_READER).toBe('gemini-3.1-pro-preview')
    expect(isPrimaryReader('gemini-3.1-pro-preview')).toBe(true)
    expect(isPrimaryReader('gemini-3.5-flash')).toBe(false)
  })

  it('the live provider default model MATCHES the matrix primary', () => {
    // primaryGeminiModel() reads GEMINI_MODEL (unset in test) → must default to PRIMARY_READER.
    delete process.env.GEMINI_MODEL
    expect(primaryGeminiModel()).toBe(PRIMARY_READER)
  })

  it('acceptanceModelVerdict: ONLY the primary read is acceptance-valid', () => {
    expect(acceptanceModelVerdict(PRIMARY_READER)).toEqual({ valid: true })
    expect(acceptanceModelVerdict('gemini-3.5-flash')).toEqual({ valid: false, reason: 'fallback_model_not_acceptance_valid' })
    expect(acceptanceModelVerdict('gemini-2.5-flash')).toEqual({ valid: false, reason: 'fallback_model_not_acceptance_valid' })
    expect(acceptanceModelVerdict('some-random-model')).toEqual({ valid: false, reason: 'unsanctioned_model' })
    expect(acceptanceModelVerdict(null)).toEqual({ valid: false, reason: 'no_model' })
  })

  it('assertPrimaryReader throws on any non-primary model', () => {
    expect(() => assertPrimaryReader(PRIMARY_READER)).not.toThrow()
    expect(() => assertPrimaryReader('gemini-3.5-flash')).toThrow(/model_matrix_violation/)
    expect(() => assertPrimaryReader(null)).toThrow(/model_matrix_violation/)
  })

  it('2.5-flash is DISQUALIFIED for certificate doc classes (read a different person)', () => {
    expect(isDisqualifiedFor('gemini-2.5-flash', 'ua_birth_certificate')).toBe(true)
    expect(isDisqualifiedFor('gemini-2.5-flash', 'ua_marriage_certificate')).toBe(true)
    expect(isDisqualifiedFor('gemini-2.5-flash', 'ua_internal_passport_booklet')).toBe(false)
    expect(isDisqualifiedFor(PRIMARY_READER, 'ua_birth_certificate')).toBe(false)
  })

  it('sanctioned chain = primary + the two flash fallbacks', () => {
    expect([...SANCTIONED_CHAIN]).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-2.5-flash'])
    expect([...FALLBACK_MODELS].every((m) => isSanctionedModel(m))).toBe(true)
  })
})

describe('GUARD: the provider source obeys the matrix (no drift, no deprecated model)', () => {
  it("provider's primary default is exactly the matrix primary", () => {
    expect(PROVIDER_SRC).toContain(`'${PRIMARY_READER}'`)
  })

  it('provider fallback chain contains exactly the sanctioned fallbacks', () => {
    for (const m of FALLBACK_MODELS) expect(PROVIDER_SRC).toContain(`'${m}'`)
  })

  it('NO deprecated model appears as an ACTIVE chain member (only allowed in a comment)', () => {
    for (const dead of DEPRECATED_MODELS) {
      // The string may appear in a "removed/deprecated" comment, but never inside the
      // returned array literal. Assert it is not present on a non-comment code line.
      const offending = PROVIDER_SRC.split('\n').filter((ln) => {
        const code = ln.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
        return code.includes(`'${dead}'`)
      })
      expect(offending, `deprecated model ${dead} used in active code:\n${offending.join('\n')}`).toEqual([])
    }
  })
})
