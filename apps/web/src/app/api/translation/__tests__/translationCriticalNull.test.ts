/**
 * translationCriticalNull.test.ts — C2 (audit #195, Agent B HIGHEST-PRIORITY).
 *
 * Hard rule under test: the TRANSLATION pipeline must NEVER guess a critical field.
 * An uncertain / low-confidence critical field MUST be emitted with:
 *   value      = null
 *   finalValue = null
 *   review_required = true
 * and the raw read parked in candidate_value — NEVER shipped as the final value.
 *
 * Two layers of proof:
 *  1. BEHAVIOR — call the route's own safety helper (`applyOcrFieldSafety`,
 *     flow 'translation_public') with a synthetic, PII-FREE field set and assert
 *     the critical-null discipline holds, while a safe non-critical field passes.
 *  2. WIRING — assert the route runs this guard UNCONDITIONALLY for translation
 *     (no `isOcrFieldSafetyEnabled()` / OCR_FIELD_SAFETY_ENABLED env gate at the
 *     call site), so the discipline holds at PROD DEFAULTS. This is the exact bug
 *     audit #195 flagged: at flag-OFF prod defaults the route shipped a guess.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  applyOcrFieldSafety,
  classifyCriticality,
  type SafeField,
} from '@/lib/documentSafety/applyOcrFieldSafety'

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, '..', 'vision-extract', 'route.ts'),
  'utf-8',
)

describe('translation critical-null discipline — behavior', () => {
  it('an uncertain / low-confidence CRITICAL field is emitted value=null + finalValue=null + review_required, raw parked as candidate', () => {
    // Synthetic, PII-free placeholders. `family_name` classifies as critical_identity.
    const fields: SafeField[] = [
      {
        field: 'family_name',
        value: 'PLACEHOLDER_SURNAME', // a low-confidence guess the model produced
        confidence: 0.40, // below the 0.70 confidence floor → not trustworthy as final
        review_required: false,
      },
    ]

    // Sanity: the field we test really is treated as critical.
    expect(classifyCriticality('family_name')).toBe('critical_identity')

    const { fields: out, anyUnresolvedCritical } = applyOcrFieldSafety(fields, {
      flow: 'translation_public',
      document_class: 'ua_passport',
    })

    const f = out[0]
    // NEVER a guessed value in the value slot.
    expect(f.value).toBeNull()
    // C3 is the only writer of finalValue: rejected critical → null.
    expect(f.finalValue).toBeNull()
    // Must be flagged for human review (monotonic, can only increase).
    expect(f.review_required).toBe(true)
    // The raw read is preserved as a candidate — content never destroyed, just not released.
    expect(f.candidate_value).toBe('PLACEHOLDER_SURNAME')
    // Route uses this to gate output (PDF/payment).
    expect(anyUnresolvedCritical).toBe(true)
  })

  it('zero recognition (no usable read) for a critical field → value=null + finalValue=null + review_required (never a fabricated value)', () => {
    const fields: SafeField[] = [
      { field: 'given_name', value: null, review_required: false },
    ]
    const { fields: out, anyUnresolvedCritical } = applyOcrFieldSafety(
      fields,
      { flow: 'translation_public', document_class: 'ua_passport' },
      { zeroRecognition: true },
    )
    const f = out[0]
    expect(f.value).toBeNull()
    expect(f.finalValue).toBeNull()
    expect(f.review_required).toBe(true)
    expect(anyUnresolvedCritical).toBe(true)
  })

  it('a safe, high-confidence NON-critical field is preserved (no over-blocking)', () => {
    const fields: SafeField[] = [
      {
        field: 'address',
        value: '123 PLACEHOLDER ST',
        confidence: 0.99,
        review_required: false,
      },
    ]
    expect(classifyCriticality('address')).toBe('admin')
    const { fields: out, anyUnresolvedCritical } = applyOcrFieldSafety(fields, {
      flow: 'translation_public',
      document_class: 'ua_passport',
    })
    const f = out[0]
    // Non-critical, source-consistent → released as final.
    expect(f.value).toBe('123 PLACEHOLDER ST')
    expect(f.finalValue).toBe('123 PLACEHOLDER ST')
    expect(anyUnresolvedCritical).toBe(false)
  })
})

describe('translation critical-null discipline — wiring (always-on at prod defaults)', () => {
  it('the route applies applyOcrFieldSafety with flow=translation_public', () => {
    expect(ROUTE).toMatch(/applyOcrFieldSafety\(/)
    expect(ROUTE).toMatch(/flow:\s*'translation_public'/)
  })

  it('the safety guard is NOT gated behind the OCR_FIELD_SAFETY_ENABLED env flag (would re-introduce the audit #195 bug)', () => {
    // The whole point of C2: no env-flag guard around the translation safety call,
    // and the flag-reader is no longer imported (the word may only survive in an
    // explanatory comment describing the removed gate).
    expect(ROUTE).not.toMatch(/if\s*\(\s*isOcrFieldSafetyEnabled\s*\(\s*\)\s*\)/)
    expect(ROUTE).not.toMatch(/import[^\n]*isOcrFieldSafetyEnabled[^\n]*from/)
    // A call (not a comment mention) to the flag-reader must be gone.
    expect(ROUTE).not.toMatch(/[^/\n*]\bisOcrFieldSafetyEnabled\s*\(\s*\)/)
  })
})
