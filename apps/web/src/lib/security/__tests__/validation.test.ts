/**
 * Phase 0 multi-service wizard refactor — service-slug whitelist coverage.
 *
 * Until Phase 0 the wizard hardcoded `service_slug = 're-parole-u4u'` everywhere
 * (API body, localStorage key, WizardProvider state). Phase 0 makes the slug
 * a real input on three surfaces:
 *
 *   1. Public API (`/api/wizard/session`) — sanitiseServiceSlug whitelist
 *   2. WizardProvider — `serviceSlug` prop, threaded through state + persist
 *   3. localStorage key — `wizard:${slug}:state`
 *
 * These tests pin the whitelist + default fallback so adding a new service
 * later is a deliberate, reviewable change rather than an accidental drift.
 */
import { describe, it, expect } from 'vitest'

import {
  VALID_SERVICE_SLUGS,
  DEFAULT_SERVICE_SLUG,
  isValidServiceSlug,
  sanitiseServiceSlug,
  isValidLocale,
  sanitiseLocale,
} from '../validation'

// ── Service slugs ─────────────────────────────────────────────────────────────

describe('VALID_SERVICE_SLUGS whitelist', () => {
  it('contains the two Phase 0 production slugs', () => {
    expect(VALID_SERVICE_SLUGS).toContain('re-parole-u4u')
    expect(VALID_SERVICE_SLUGS).toContain('tps-ukraine')
  })

  it('is exactly the two production slugs — drift guard', () => {
    // Adding a new slug must be a deliberate change to both this test and the
    // whitelist. This catches accidental additions in PRs.
    expect([...VALID_SERVICE_SLUGS].sort()).toEqual(['re-parole-u4u', 'tps-ukraine'])
  })

  it('DEFAULT_SERVICE_SLUG is re-parole-u4u for backward compatibility', () => {
    // Pre-Phase-0 callers that don't pass a slug must keep landing on
    // Re-Parole, never on TPS.
    expect(DEFAULT_SERVICE_SLUG).toBe('re-parole-u4u')
  })

  it('DEFAULT_SERVICE_SLUG is itself in the whitelist', () => {
    expect(VALID_SERVICE_SLUGS).toContain(DEFAULT_SERVICE_SLUG)
  })
})

describe('isValidServiceSlug', () => {
  it('accepts re-parole-u4u', () => {
    expect(isValidServiceSlug('re-parole-u4u')).toBe(true)
  })

  it('accepts tps-ukraine', () => {
    expect(isValidServiceSlug('tps-ukraine')).toBe(true)
  })

  it('rejects unknown slugs', () => {
    expect(isValidServiceSlug('asylum')).toBe(false)
    expect(isValidServiceSlug('green-card')).toBe(false)
    expect(isValidServiceSlug('TPS-UKRAINE')).toBe(false) // case-sensitive
  })

  it('rejects empty / null / undefined', () => {
    expect(isValidServiceSlug('')).toBe(false)
    expect(isValidServiceSlug(null)).toBe(false)
    expect(isValidServiceSlug(undefined)).toBe(false)
  })

  it('rejects non-string inputs (defence against JSON injection)', () => {
    expect(isValidServiceSlug(123)).toBe(false)
    expect(isValidServiceSlug({})).toBe(false)
    expect(isValidServiceSlug([])).toBe(false)
    expect(isValidServiceSlug(true)).toBe(false)
  })
})

describe('sanitiseServiceSlug', () => {
  it('passes valid slugs through unchanged', () => {
    expect(sanitiseServiceSlug('re-parole-u4u')).toBe('re-parole-u4u')
    expect(sanitiseServiceSlug('tps-ukraine')).toBe('tps-ukraine')
  })

  it('falls back to DEFAULT_SERVICE_SLUG on garbage', () => {
    expect(sanitiseServiceSlug('asylum')).toBe(DEFAULT_SERVICE_SLUG)
    expect(sanitiseServiceSlug('')).toBe(DEFAULT_SERVICE_SLUG)
    expect(sanitiseServiceSlug(null)).toBe(DEFAULT_SERVICE_SLUG)
    expect(sanitiseServiceSlug(undefined)).toBe(DEFAULT_SERVICE_SLUG)
    expect(sanitiseServiceSlug(42)).toBe(DEFAULT_SERVICE_SLUG)
  })

  it('does not leak attacker-controlled value (always whitelist output)', () => {
    // If an attacker sends 'http://evil/tps-ukraine', the function must NOT
    // return that string — it must return the safe default.
    const out = sanitiseServiceSlug('http://evil/tps-ukraine')
    expect(VALID_SERVICE_SLUGS).toContain(out)
  })
})

// ── Locales: smoke test (already covered elsewhere, kept here for parity) ────

describe('locale helpers — smoke', () => {
  it('isValidLocale accepts all 4 wizard locales', () => {
    for (const l of ['en', 'ru', 'uk', 'es']) {
      expect(isValidLocale(l)).toBe(true)
    }
  })

  it('sanitiseLocale falls back to en', () => {
    expect(sanitiseLocale('xx')).toBe('en')
  })
})
