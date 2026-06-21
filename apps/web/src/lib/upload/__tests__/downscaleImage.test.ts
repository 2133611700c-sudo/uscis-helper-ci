/**
 * downscaleImage.test.ts — fail-safe early-return paths of the shared upload helper.
 *
 * The canvas/createImageBitmap path needs a browser; here we pin the deterministic
 * guards that protect uploads in ANY environment: small files, non-images, vector
 * formats, and the fail-open behavior when no canvas API is present (Node) — every
 * one of these must return the ORIGINAL file so an upload is never blocked.
 */
import { describe, it, expect } from 'vitest'
import { downscaleImageForUpload } from '../downscaleImage'

const mkFile = (bytes: number, type: string, name = 'x') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('downscaleImageForUpload — fail-safe returns the original', () => {
  it('returns the same file when below the threshold', async () => {
    const f = mkFile(100_000, 'image/jpeg')
    expect(await downscaleImageForUpload(f)).toBe(f)
  })

  it('returns the same file for a non-image type', async () => {
    const f = mkFile(5_000_000, 'application/pdf', 'doc.pdf')
    expect(await downscaleImageForUpload(f)).toBe(f)
  })

  it('leaves SVG and GIF untouched (not canvas-resizable)', async () => {
    const svg = mkFile(5_000_000, 'image/svg+xml')
    const gif = mkFile(5_000_000, 'image/gif')
    expect(await downscaleImageForUpload(svg)).toBe(svg)
    expect(await downscaleImageForUpload(gif)).toBe(gif)
  })

  it('fail-open: a large image with no canvas API (Node) returns the original', async () => {
    const big = mkFile(5_000_000, 'image/jpeg', 'big.jpg')
    const out = await downscaleImageForUpload(big)
    expect(out).toBe(big) // no createImageBitmap in node → original, never blocked
  })

  it('respects a custom threshold', async () => {
    const f = mkFile(2_000_000, 'image/jpeg')
    expect(await downscaleImageForUpload(f, { thresholdBytes: 5_000_000 })).toBe(f)
  })
})
