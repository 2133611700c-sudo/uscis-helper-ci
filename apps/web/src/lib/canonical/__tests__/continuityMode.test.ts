import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCanonicalMode, type CanonicalProduct } from '../continuityMode'

const PRODUCTS: CanonicalProduct[] = ['tps', 'reparole', 'ead', 'translation']
const CANONICAL_ENV_KEYS = [
  'CANONICAL_MODE_TPS',
  'CANONICAL_MODE_REPAROLE',
  'CANONICAL_MODE_EAD',
  'CANONICAL_MODE_TRANSLATION',
  'CANONICAL_MODES',
  'CANONICAL_CONTINUITY_MODE',
]

const SCOPED_KEY: Record<CanonicalProduct, string> = {
  tps: 'CANONICAL_MODE_TPS',
  reparole: 'CANONICAL_MODE_REPAROLE',
  ead: 'CANONICAL_MODE_EAD',
  translation: 'CANONICAL_MODE_TRANSLATION',
}

describe('getCanonicalMode', () => {
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = {}
    for (const k of CANONICAL_ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of CANONICAL_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.restoreAllMocks()
  })

  // ── defaults ────────────────────────────────────────────────────────────────
  it('defaults to shadow for all four products when no env is set', () => {
    for (const p of PRODUCTS) {
      expect(getCanonicalMode(p)).toBe('shadow')
    }
  })

  // ── legacy global can NEVER enforce (NEW hardened behavior) ──────────────────
  it('legacy CANONICAL_CONTINUITY_MODE=enforce yields shadow for ALL FOUR products (legacy never enforces)', () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'enforce'
    for (const p of PRODUCTS) {
      expect(getCanonicalMode(p)).toBe('shadow')
    }
  })

  it('legacy CANONICAL_CONTINUITY_MODE=off yields off for all four products', () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'off'
    for (const p of PRODUCTS) {
      expect(getCanonicalMode(p)).toBe('off')
    }
  })

  it('legacy CANONICAL_CONTINUITY_MODE=shadow yields shadow for all four products', () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'shadow'
    for (const p of PRODUCTS) {
      expect(getCanonicalMode(p)).toBe('shadow')
    }
  })

  it('legacy garbage global value clamps to shadow for all four products', () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'banana'
    for (const p of PRODUCTS) {
      expect(getCanonicalMode(p)).toBe('shadow')
    }
  })

  // ── product-scoped enforce isolation (all four products) ─────────────────────
  for (const target of PRODUCTS) {
    it(`CANONICAL_MODE_${target.toUpperCase()}=enforce enforces ONLY ${target}; others stay shadow`, () => {
      process.env[SCOPED_KEY[target]] = 'enforce'
      for (const p of PRODUCTS) {
        expect(getCanonicalMode(p)).toBe(p === target ? 'enforce' : 'shadow')
      }
    })
  }

  // ── CANONICAL_MODES JSON per-product (incl. translation enforce) ─────────────
  it('resolves per-product from CANONICAL_MODES JSON', () => {
    process.env.CANONICAL_MODES = JSON.stringify({
      tps: 'enforce',
      ead: 'enforce',
      reparole: 'enforce',
      translation: 'shadow',
    })
    expect(getCanonicalMode('tps')).toBe('enforce')
    expect(getCanonicalMode('ead')).toBe('enforce')
    expect(getCanonicalMode('reparole')).toBe('enforce')
    expect(getCanonicalMode('translation')).toBe('shadow')
  })

  it('explicit CANONICAL_MODE_TRANSLATION=enforce allows translation enforce (explicit opt-in)', () => {
    process.env.CANONICAL_MODE_TRANSLATION = 'enforce'
    expect(getCanonicalMode('translation')).toBe('enforce')
  })

  it('explicit CANONICAL_MODES.translation=enforce allows translation enforce', () => {
    process.env.CANONICAL_MODES = JSON.stringify({ translation: 'enforce' })
    expect(getCanonicalMode('translation')).toBe('enforce')
  })

  // ── precedence: product-env > JSON > legacy ──────────────────────────────────
  it('precedence: product-scoped env beats JSON beats legacy global', () => {
    // legacy global says off, JSON says shadow, scoped says enforce → enforce
    process.env.CANONICAL_CONTINUITY_MODE = 'off'
    process.env.CANONICAL_MODES = JSON.stringify({ tps: 'shadow' })
    process.env.CANONICAL_MODE_TPS = 'enforce'
    expect(getCanonicalMode('tps')).toBe('enforce')

    // remove scoped → JSON wins over legacy global
    delete process.env.CANONICAL_MODE_TPS
    expect(getCanonicalMode('tps')).toBe('shadow')

    // remove JSON → legacy global wins (off)
    delete process.env.CANONICAL_MODES
    expect(getCanonicalMode('tps')).toBe('off')
  })

  it('JSON enforce wins even when legacy global=off would otherwise yield off', () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'off'
    process.env.CANONICAL_MODES = JSON.stringify({ reparole: 'enforce' })
    expect(getCanonicalMode('reparole')).toBe('enforce')
  })

  // ── malformed values ─────────────────────────────────────────────────────────
  it('falls through to shadow on malformed scoped value', () => {
    process.env.CANONICAL_MODE_TPS = 'banana'
    expect(getCanonicalMode('tps')).toBe('shadow')
  })

  it('malformed CANONICAL_MODES JSON → shadow + PII-safe warning (no raw value leaked)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.CANONICAL_MODES = '{ not valid json — secret123'
    expect(getCanonicalMode('tps')).toBe('shadow')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('CANONICAL_MODES is not valid JSON')
    expect(msg).toContain('product=tps')
    // PII safety: the raw env value must NEVER appear in the warning.
    expect(msg).not.toContain('secret123')
    expect(msg).not.toContain('not valid json —')
  })

  it('malformed CANONICAL_MODES JSON falls through to legacy global (clamped, never enforce)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.CANONICAL_MODES = '{ broken'
    process.env.CANONICAL_CONTINUITY_MODE = 'enforce'
    // legacy enforce is clamped to shadow even when JSON is malformed
    expect(getCanonicalMode('tps')).toBe('shadow')
  })

  it('malformed CANONICAL_MODES JSON falls through to legacy off', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.CANONICAL_MODES = '{ broken'
    process.env.CANONICAL_CONTINUITY_MODE = 'off'
    expect(getCanonicalMode('tps')).toBe('off')
  })

  it('ignores malformed JSON per-product value and falls to legacy global (clamped to shadow)', () => {
    process.env.CANONICAL_MODES = JSON.stringify({ tps: 'banana' })
    process.env.CANONICAL_CONTINUITY_MODE = 'enforce'
    // legacy enforce never wins → shadow
    expect(getCanonicalMode('tps')).toBe('shadow')
  })

  it('normalizes case/whitespace on scoped values', () => {
    process.env.CANONICAL_MODE_EAD = '  ENFORCE  '
    expect(getCanonicalMode('ead')).toBe('enforce')
  })
})
