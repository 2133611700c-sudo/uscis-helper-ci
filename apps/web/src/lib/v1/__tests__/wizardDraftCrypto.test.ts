import { describe, it, expect } from 'vitest'
import {
  generateOpaqueToken,
  keyFromEnv,
  sealDraft,
  openDraft,
  isDraftExpired,
} from '../wizardDraftCrypto'

const KEY_HEX = 'a'.repeat(64)
const key = Buffer.from(KEY_HEX, 'hex')

describe('generateOpaqueToken', () => {
  it('is 64 hex chars and unique', () => {
    const a = generateOpaqueToken()
    const b = generateOpaqueToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('keyFromEnv — fail-closed', () => {
  it('returns a 32-byte key from valid hex', () => {
    expect(keyFromEnv({ WIZARD_DRAFT_ENC_KEY: KEY_HEX }).length).toBe(32)
  })
  it('throws when the key is missing or malformed', () => {
    expect(() => keyFromEnv({})).toThrow(/wizard_draft_enc_key/)
    expect(() => keyFromEnv({ WIZARD_DRAFT_ENC_KEY: 'short' })).toThrow()
    expect(() => keyFromEnv({ WIZARD_DRAFT_ENC_KEY: 'z'.repeat(64) })).toThrow()
  })
})

describe('seal/open — authenticated round-trip', () => {
  const plaintext = JSON.stringify({ family_name: 'X', raw_cyrillic: 'Y', dob: '1990-01-01' })

  it('round-trips plaintext', () => {
    const sealed = sealDraft(plaintext, key)
    expect(sealed.ciphertext).not.toContain('family_name') // ciphertext is opaque
    expect(openDraft(sealed, key)).toBe(plaintext)
  })

  it('uses a fresh IV each time (different ciphertext for same input)', () => {
    expect(sealDraft(plaintext, key).ciphertext).not.toBe(sealDraft(plaintext, key).ciphertext)
  })

  it('fails closed with the wrong key', () => {
    const sealed = sealDraft(plaintext, key)
    expect(() => openDraft(sealed, Buffer.from('b'.repeat(64), 'hex'))).toThrow()
  })

  it('fails closed if the ciphertext or tag is tampered', () => {
    const sealed = sealDraft(plaintext, key)
    const tamperedCt = { ...sealed, ciphertext: sealed.ciphertext.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }
    expect(() => openDraft(tamperedCt, key)).toThrow()
    const tamperedTag = { ...sealed, tag: sealed.tag.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }
    expect(() => openDraft(tamperedTag, key)).toThrow()
  })
})

describe('isDraftExpired', () => {
  it('honors the TTL window', () => {
    expect(isDraftExpired(1000, 5000, 5999)).toBe(false)
    expect(isDraftExpired(1000, 5000, 6001)).toBe(true)
  })
})
