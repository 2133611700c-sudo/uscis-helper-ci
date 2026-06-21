/**
 * heicToJpeg.test.ts — REAL HEIC file (sips-generated from the synthetic passport,
 * zero PII) through the REAL sharp decode. Not on trust.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { heicToJpeg, looksLikeHeic } from '../heicToJpeg'

const FIXTURES = path.join(__dirname, '../../../../../../test-fixtures')
const HEIC = readFileSync(path.join(FIXTURES, 'synthetic-passport.heic'))
const JPEG = readFileSync(path.join(FIXTURES, 'synthetic-passport.jpg'))

describe('looksLikeHeic', () => {
  it('detects by magic bytes even with a missing mime', () => {
    expect(looksLikeHeic(HEIC, null)).toBe(true)
    expect(looksLikeHeic(HEIC, 'application/octet-stream')).toBe(true)
  })
  it('does not flag a JPEG', () => {
    expect(looksLikeHeic(JPEG, 'image/jpeg')).toBe(false)
  })
})

describe('heicToJpeg — real decode via sharp', () => {
  it('converts the real HEIC to a valid JPEG', async () => {
    const r = await heicToJpeg(HEIC, 'image/heic')
    expect(r.converted).toBe(true)
    expect(r.mimeType).toBe('image/jpeg')
    expect(r.buffer.subarray(0, 2).toString('hex')).toBe('ffd8') // JPEG SOI
    expect(r.buffer.length).toBeGreaterThan(10_000)
  })
  it('passes a JPEG through untouched', async () => {
    const r = await heicToJpeg(JPEG, 'image/jpeg')
    expect(r.converted).toBe(false)
    expect(r.buffer).toBe(JPEG)
  })
  it('fail-open: garbage with a heic mime returns the original buffer, never throws', async () => {
    const garbage = Buffer.from('not an image at all, just bytes')
    const r = await heicToJpeg(garbage, 'image/heic')
    expect(r.converted).toBe(false)
    expect(r.buffer).toBe(garbage)
  })
})

describe('preprocessImage — accepts real HEIC end-to-end (fixes TPS/EAD/Reparole gap)', () => {
  it('the real HEIC fixture passes the full preprocess pipeline as JPEG', async () => {
    const { preprocessImage } = await import('../image-preprocess')
    const r = await preprocessImage(HEIC, 'image/heic')
    expect(r.ok, `preprocess must accept HEIC, got: ${'message' in r ? r.message : ''}`).toBe(true)
    if (r.ok) expect(r.mimeType).toBe('image/jpeg')
  })
})
