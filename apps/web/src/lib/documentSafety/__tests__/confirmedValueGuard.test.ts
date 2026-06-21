/**
 * confirmedValueGuard.test.ts — Phase 3.1 (ADR-017 C3) server-side release-value sanitation.
 *
 * Pins the deterministic guard that every value about to enter a CERTIFIED
 * English translation PDF must pass. No AI, no I/O. Release values are Latin
 * post-KMU-55; Cyrillic / control chars / over-length / malformed dates are
 * defects that must never reach a legal document.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { validateConfirmedValue } from '../confirmedValueGuard'

describe('validateConfirmedValue — hard sanitation', () => {
  it('rejects Cyrillic in a release value', () => {
    const v = validateConfirmedValue('family_name', 'Кузьменко')
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('cyrillic_in_release_value')
  })

  it('accepts a clean Latin name', () => {
    expect(validateConfirmedValue('family_name', 'Kuzmenko').ok).toBe(true)
  })

  it('rejects an over-length value (>200)', () => {
    const v = validateConfirmedValue('given_name', 'A'.repeat(201))
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('too_long')
  })

  it('rejects control / non-printable characters', () => {
    const v = validateConfirmedValue('given_name', 'Ivan')
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('invalid_chars')
  })
})

describe('validateConfirmedValue — critical empties', () => {
  it('rejects empty value on a critical field', () => {
    const v = validateConfirmedValue('family_name', '')
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('empty_critical')
  })

  it('rejects whitespace-only value on a critical field', () => {
    expect(validateConfirmedValue('dob', '   ').ok).toBe(false)
  })

  it('accepts empty value on a non-critical field (nothing dangerous to release)', () => {
    expect(validateConfirmedValue('us_address', '').ok).toBe(true)
  })
})

describe('validateConfirmedValue — date format', () => {
  it('accepts MM/DD/YYYY', () => {
    expect(validateConfirmedValue('date_of_birth', '01/01/1990').ok).toBe(true)
  })

  it('accepts ISO YYYY-MM-DD (the canonical pipeline date format)', () => {
    expect(validateConfirmedValue('date_of_birth', '1990-01-01').ok).toBe(true)
  })

  it('rejects a European-style dotted date', () => {
    const v = validateConfirmedValue('date_of_birth', '01.01.1990')
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('invalid_date_format')
  })

  it('rejects an impossible month', () => {
    expect(validateConfirmedValue('issue_date', '13/01/2020').ok).toBe(false)
  })
})

describe('generate-pdf route — guard is wired and PII-safe', () => {
  const ROUTE = path.resolve(
    __dirname,
    '../../../app/api/translation/generate-pdf/route.ts',
  )
  const src = fs.readFileSync(ROUTE, 'utf-8')

  it('route imports and calls validateConfirmedValue', () => {
    expect(src).toContain('validateConfirmedValue')
    expect(src).toContain('confirmed_value_guard')
  })

  it('route runs the guard UNCONDITIONALLY (not behind the OCR_FIELD_SAFETY flag)', () => {
    // The confirmed-value loop must appear BEFORE the isOcrFieldSafetyEnabled() block.
    const guardIdx = src.indexOf('validateConfirmedValue(f.field')
    const flagIdx = src.indexOf('if (isOcrFieldSafetyEnabled())')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(flagIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(flagIdx)
  })

  it('route never echoes the rejected value (PII rule — field name only)', () => {
    // The response object for the guard must carry `field:` but not the value.
    expect(src).toContain('gate: \'confirmed_value_guard\', field: f.field')
  })

  it('guard returns 422 Unprocessable Entity, not 403 (content invalid ≠ auth failure)', () => {
    // Find the confirmed_value_guard RESPONSE (anchored to the response-only
    // `, field: f.field` so a metrics call sharing the gate name doesn't match) and
    // confirm its status is 422.
    const guardBlock = src.slice(src.indexOf('gate: \'confirmed_value_guard\', field: f.field'))
    expect(guardBlock.slice(0, 160)).toContain('status: 422')
  })

  it('REGRESSION (agent-A ghost): guard has NO confirmed-flag gate — validates ALL release values', () => {
    // Agent A keyed the loop on `f.confirmed !== true` (a flag the client never
    // sends → dead code). Ensure no such gate reappears before validation.
    expect(src).not.toMatch(/if\s*\(\s*f\.confirmed\s*!==\s*true\s*\)\s*continue/)
    // The only `continue` inside the guard loop must be the non-critical drop path.
  })

  it('ships in SHADOW mode by default (measurement-first; prod byte-identical until enforced)', () => {
    expect(src).toContain('CONFIRMED_VALUE_GUARD_MODE')
    expect(src).toContain("?? 'shadow'")
    // shadow path must NOT block: a would_block branch that continues without mutating output.
    expect(src).toContain('would_block')
    expect(src).toMatch(/if\s*\(!enforce\)\s*continue/)
  })

  it('has a single env knob with off = emergency kill-switch (no flag sprawl)', () => {
    expect(src).toContain("guardMode === 'off'")
    expect(src).toContain('degraded safety')
  })

  it('guard-block emits a PII-free structured log (field + reason, never the value)', () => {
    expect(src).toContain('[confirmed_value_guard]')
    expect(src).toContain('field: f.field, criticality, reason: verdict.reason')
  })
})
