/**
 * wizardDraftCrypto — V1 server-side session ledger (PII removal from browser).
 *
 * Goal: the browser keeps only an OPAQUE TOKEN; the wizard draft (which contains
 * PII: names/DOB/address/document values, and raw_cyrillic) lives server-side,
 * ENCRYPTED AT REST. This module is the crypto + codec core (no DB, no I/O) so it
 * is pure and fully testable. AES-256-GCM (authenticated) — tampering fails closed.
 *
 * Server-only. The key comes from env WIZARD_DRAFT_ENC_KEY (64 hex chars = 32
 * bytes); a missing/invalid key throws (fail-closed — never store PII unencrypted).
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

export type SealedDraft = {
  iv: string // hex
  ciphertext: string // hex
  tag: string // hex (GCM auth tag)
}

/** Opaque, unguessable browser token (no PII, no session data). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex')
}

/** Resolve the 32-byte key from env hex. Fail-closed if absent/malformed. */
export function keyFromEnv(env: Record<string, string | undefined>): Buffer {
  const hex = (env.WIZARD_DRAFT_ENC_KEY ?? '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('wizard_draft_enc_key_missing_or_invalid: expected 64 hex chars (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt a draft (UTF-8 plaintext) → authenticated SealedDraft. */
export function sealDraft(plaintext: string, key: Buffer): SealedDraft {
  if (key.length !== KEY_BYTES) throw new Error('wizard_draft_key_size: key must be 32 bytes')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('hex'), ciphertext: ct.toString('hex'), tag: tag.toString('hex') }
}

/** Decrypt a SealedDraft → plaintext. Throws if the key is wrong or data tampered. */
export function openDraft(sealed: SealedDraft, key: Buffer): string {
  if (key.length !== KEY_BYTES) throw new Error('wizard_draft_key_size: key must be 32 bytes')
  const decipher = createDecipheriv(ALGO, key, Buffer.from(sealed.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(sealed.tag, 'hex'))
  const pt = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'hex')), decipher.final()])
  return pt.toString('utf8')
}

/** TTL helper: a draft is expired when nowMs > createdAtMs + ttlMs. */
export function isDraftExpired(createdAtMs: number, ttlMs: number, nowMs: number): boolean {
  return nowMs > createdAtMs + ttlMs
}
