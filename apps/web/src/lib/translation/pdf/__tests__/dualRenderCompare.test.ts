/**
 * dualRenderCompare.test.ts — the dual-render log must be PII-free (hashes +
 * byte counts only) and must equate content-identical renders despite volatile
 * PDF metadata (/CreationDate, /ID).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildDualRenderLog, normalizePdfBytes, isDualRenderEnabled } from '../dualRenderCompare'

const PDF_A = Buffer.from(
  '%PDF-1.4 (IVANENKO TARAS) /CreationDate(D:20260611120000Z) /ID[<aabb><ccdd>] body',
  'latin1',
)
const PDF_A_LATER = Buffer.from(
  '%PDF-1.4 (IVANENKO TARAS) /CreationDate(D:20260611999999Z) /ID[<1122><3344>] body',
  'latin1',
)
const PDF_B = Buffer.from(
  '%PDF-1.4 (DIFFERENT CONTENT) /CreationDate(D:20260611120000Z) /ID[<aabb><ccdd>] body',
  'latin1',
)

afterEach(() => vi.unstubAllEnvs())

describe('buildDualRenderLog', () => {
  it('contains ONLY hashes and byte counts — no document text leaks (PII rule)', () => {
    const log = buildDualRenderLog('ua_internal_passport_booklet', PDF_A, PDF_B)
    const s = JSON.stringify(log)
    expect(s).not.toContain('IVANENKO')
    expect(s).not.toContain('DIFFERENT')
    expect(log.mirror_bytes).toBe(PDF_A.length)
    expect(log.legacy_bytes).toBe(PDF_B.length)
    expect(log.mirror_sha256).toMatch(/^[0-9a-f]{16}$/)
  })

  it('normalized hashes equate content-identical renders across timestamps/IDs', () => {
    const log = buildDualRenderLog('ua_id_card', PDF_A, PDF_A_LATER)
    expect(log.mirror_sha256).not.toBe(log.legacy_sha256) // raw differs by design
    expect(log.normalized_identical).toBe(true)
  })

  it('normalized hashes still differ for genuinely different content', () => {
    const log = buildDualRenderLog('ua_id_card', PDF_A, PDF_B)
    expect(log.normalized_identical).toBe(false)
  })

  it('normalizePdfBytes is byte-stable (idempotent)', () => {
    const once = normalizePdfBytes(PDF_A)
    expect(normalizePdfBytes(once).equals(once)).toBe(true)
  })
})

describe('isDualRenderEnabled', () => {
  it('default OFF; only the literal "1" enables', () => {
    vi.stubEnv('PASSPORT_SCHEMA_DUAL_RENDER_ENABLED', '')
    expect(isDualRenderEnabled()).toBe(false)
    vi.stubEnv('PASSPORT_SCHEMA_DUAL_RENDER_ENABLED', 'true')
    expect(isDualRenderEnabled()).toBe(false)
    vi.stubEnv('PASSPORT_SCHEMA_DUAL_RENDER_ENABLED', '1')
    expect(isDualRenderEnabled()).toBe(true)
  })
})
