/**
 * documentState.test.ts — TPS per-document state isolation. A new document must
 * not inherit the previous person's attestation / legal-risk / Part-7 answers.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  clearTpsDocumentState,
  TPS_DOC_SESSION_KEYS,
  TPS_ATTEST_KEY,
  TPS_LEGAL_RISK_KEY,
  TPS_PART7_KEY,
} from '../documentState'

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    removeItem: (k: string) => void store.delete(k),
    has: (k: string) => store.has(k),
    size: () => store.size,
  }
}

describe('TPS per-document state reset', () => {
  it('clears attestation, legal-risk and Part-7 keys', () => {
    const s = fakeStorage({
      [TPS_ATTEST_KEY]: '123',
      [TPS_LEGAL_RISK_KEY]: '{"has_criminal_concern":true}',
      [TPS_PART7_KEY]: '{}',
      'wizard:tps-ukraine:personal:v1': '{keep:1}',
    })
    clearTpsDocumentState(s)
    expect(s.has(TPS_ATTEST_KEY)).toBe(false)
    expect(s.has(TPS_LEGAL_RISK_KEY)).toBe(false)
    expect(s.has(TPS_PART7_KEY)).toBe(false)
    // the personal-fields blob is the caller's concern — NOT cleared here
    expect(s.has('wizard:tps-ukraine:personal:v1')).toBe(true)
  })

  it('covers exactly the three per-document keys', () => {
    expect([...TPS_DOC_SESSION_KEYS].sort()).toEqual([TPS_ATTEST_KEY, TPS_LEGAL_RISK_KEY, TPS_PART7_KEY].sort())
  })

  it('never throws without a storage / on a throwing storage', () => {
    expect(() => clearTpsDocumentState(undefined)).not.toThrow()
    const throwing = { removeItem: () => { throw new Error('boom') } }
    expect(() => clearTpsDocumentState(throwing)).not.toThrow()
  })
})

describe('TPSWizardV2 — restart wires the reset (source guard)', () => {
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'app', '[locale]', 'services', 'tps-ukraine', 'start', 'TPSWizardV2.tsx'),
    'utf-8',
  )
  it('imports and calls clearTpsDocumentState in the restart path', () => {
    expect(SRC).toMatch(/import \{ clearTpsDocumentState \} from '@\/lib\/tps\/documentState'/)
    const restart = SRC.slice(SRC.indexOf('const restart = useCallback'))
    expect(restart.slice(0, 400)).toMatch(/clearTpsDocumentState\(\)/)
  })
})
