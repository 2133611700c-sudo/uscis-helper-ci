/**
 * Phase 0 multi-service wizard refactor — WizardProvider isolation guards.
 *
 * This repo doesn't carry @testing-library/react, so we don't mount the
 * provider. Instead we pin three concrete invariants that protect Re-Parole
 * from TPS Ukraine regressions:
 *
 *   1. `buildLocalStorageKey(slug)` produces a slug-namespaced key so
 *      Re-Parole and TPS sessions cannot collide in localStorage.
 *
 *   2. WizardProvider exposes a `serviceSlug` prop with the documented
 *      default of `'re-parole-u4u'` (backward compatibility for pre-Phase-0
 *      callers that haven't been updated yet).
 *
 *   3. The hardcoded `'re-parole-u4u'` literal is gone from the places that
 *      previously made the provider Re-Parole-only — specifically the
 *      `createSession()` body and the `buildInitialState()` return shape.
 *      Those values must now be sourced from the prop / state, never a
 *      literal. (A future cycle could re-introduce the literal if Sentry
 *      logs prove regression, but this guard makes that an explicit choice.)
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { buildLocalStorageKey } from '../wizardStorageKey'

const CONTEXT_FILE = path.resolve(__dirname, '..', 'WizardContext.tsx')

// ── 1. localStorage key is namespaced per slug ───────────────────────────────

describe('buildLocalStorageKey', () => {
  it('namespaces Re-Parole under wizard:re-parole-u4u:state', () => {
    expect(buildLocalStorageKey('re-parole-u4u')).toBe('wizard:re-parole-u4u:state')
  })

  it('namespaces TPS Ukraine under wizard:tps-ukraine:state', () => {
    expect(buildLocalStorageKey('tps-ukraine')).toBe('wizard:tps-ukraine:state')
  })

  it('Re-Parole and TPS keys are distinct (sessions cannot collide)', () => {
    const a = buildLocalStorageKey('re-parole-u4u')
    const b = buildLocalStorageKey('tps-ukraine')
    expect(a).not.toBe(b)
  })

  it('format is stable: wizard:${slug}:state', () => {
    expect(buildLocalStorageKey('some-future-service')).toBe(
      'wizard:some-future-service:state',
    )
  })
})

// ── 2. WizardProvider exposes a serviceSlug prop with default ────────────────

describe('WizardProvider serviceSlug prop contract', () => {
  const src = fs.readFileSync(CONTEXT_FILE, 'utf8')

  it('exports WizardProviderProps with optional serviceSlug', () => {
    expect(src).toMatch(/export interface WizardProviderProps[\s\S]*serviceSlug\?:\s*string/)
  })

  it('default value is re-parole-u4u for backward compatibility', () => {
    // Catches accidental flip of the default to 'tps-ukraine' which would
    // silently break every existing Re-Parole call site that omits the prop.
    expect(src).toMatch(/serviceSlug\s*=\s*['"]re-parole-u4u['"]/)
  })

  it('serviceSlug prop is threaded into buildInitialState', () => {
    expect(src).toMatch(/buildInitialState\s*\(\s*serviceSlug\s*\)/)
  })
})

// ── 3. Re-Parole literal is no longer hardcoded inside the runtime path ──────

describe('Re-Parole hardcoding is gone from WizardProvider runtime', () => {
  const src = fs.readFileSync(CONTEXT_FILE, 'utf8')

  it('buildInitialState no longer hardcodes serviceSlug', () => {
    // The old code returned `serviceSlug: 're-parole-u4u'` inside the
    // initial-state object literal. After Phase 0 it must use the param.
    const initStateBlock = src.slice(
      src.indexOf('function buildInitialState'),
      src.indexOf('// ---', src.indexOf('function buildInitialState')),
    )
    expect(initStateBlock).not.toMatch(/serviceSlug:\s*['"]re-parole-u4u['"]/)
    expect(initStateBlock).toMatch(/serviceSlug,/)
  })

  it('createSession sends the supplied serviceSlug, not a literal', () => {
    const createSessionBlock = src.slice(
      src.indexOf('async function createSession'),
      src.indexOf('async function fetchSession'),
    )
    expect(createSessionBlock).toMatch(/service_slug:\s*serviceSlug/)
    expect(createSessionBlock).not.toMatch(/service_slug:\s*['"]re-parole-u4u['"]/)
  })

  it('localStorage const LS_KEY is removed in favour of buildLocalStorageKey', () => {
    // Phase 0 deliberately removed the module-level LS_KEY literal because
    // it baked the slug at load time. Persistence now goes through the
    // helper, which keys per slug.
    expect(src).not.toMatch(/^const LS_KEY/m)
  })
})
