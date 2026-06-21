/**
 * formIntegrity tests — CB.6 / B2.
 *
 * Locked guards:
 *   1. Each pinned PDF on disk MUST match its registered hash. If this
 *      test fails, either the PDF was replaced (security event) or the
 *      pinned hash is stale (procedure: refresh forms + bump
 *      PINNED_HASHES + bump field maps together).
 *   2. assertFormIntegrity throws on mismatch (cannot be silently
 *      bypassed).
 *   3. assertFormIntegrity throws on unknown form key (fail-closed).
 *   4. After the first successful check, subsequent calls are cached
 *      and don't re-hash.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { describe, it, expect, beforeEach } from 'vitest'

import {
  PINNED_HASHES,
  assertFormIntegrity,
  _resetIntegrityCacheForTests,
} from '../formIntegrity'

const PUBLIC_TPS = path.join(process.cwd(), 'public', 'uscis', 'tps')
const PUBLIC_RP = path.join(process.cwd(), 'public', 'uscis', 'reparole')

function sha256(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex')
}

beforeEach(() => {
  _resetIntegrityCacheForTests()
})

describe('PDF integrity — pinned hashes match on-disk files', () => {
  for (const [name, pinned] of Object.entries(PINNED_HASHES)) {
    it(`${name} on-disk SHA256 matches PINNED_HASHES`, () => {
      const dir = name === 'i-131.pdf' ? PUBLIC_RP : PUBLIC_TPS
      const full = path.join(dir, name)
      // If the file is missing this test should fail loudly — the runtime
      // would throw at the first request, so the test must also.
      expect(fs.existsSync(full), `missing PDF: ${full}`).toBe(true)
      const bytes = fs.readFileSync(full)
      const actual = sha256(new Uint8Array(bytes))
      expect(actual, `Form ${name} on disk does not match pinned hash. Either the PDF was replaced (security event) or PINNED_HASHES is stale.`).toBe(pinned)
    })
  }
})

describe('assertFormIntegrity behaviour', () => {
  it('passes for matching bytes', () => {
    const i821 = fs.readFileSync(path.join(PUBLIC_TPS, 'i-821.pdf'))
    expect(() =>
      assertFormIntegrity('i-821.pdf', new Uint8Array(i821)),
    ).not.toThrow()
  })

  it('throws on tampered bytes', () => {
    const i821 = fs.readFileSync(path.join(PUBLIC_TPS, 'i-821.pdf'))
    // Flip a single byte at the end (past PDF header so we don't break
    // the structure trivially) — any tamper must trip the hash.
    const tampered = new Uint8Array(i821)
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff
    expect(() => assertFormIntegrity('i-821.pdf', tampered)).toThrow(
      /tampered or replaced/i,
    )
  })

  it('throws on unknown form key (fail-closed)', () => {
    const dummy = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
    expect(() =>
      assertFormIntegrity('i-129.pdf', dummy),
    ).toThrow(/no pinned hash/i)
  })

  it('caches verification — second call does not re-hash', () => {
    const i821 = fs.readFileSync(path.join(PUBLIC_TPS, 'i-821.pdf'))
    assertFormIntegrity('i-821.pdf', new Uint8Array(i821))
    // After the first verification succeeds, a SUBSEQUENT call with
    // tampered bytes should NOT throw — proves the cache short-circuits.
    // (In production we never reach here with different bytes for the
    // same key; this purely documents the cache contract.)
    const tampered = new Uint8Array(i821)
    tampered[10] = tampered[10] ^ 0xff
    expect(() =>
      assertFormIntegrity('i-821.pdf', tampered),
    ).not.toThrow()
  })
})
