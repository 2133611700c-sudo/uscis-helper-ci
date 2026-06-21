/**
 * autoOrient.test.ts — fail-open contract for content-orientation correction.
 *
 * The detect step is a Gemini call (not unit-tested here); these pin the
 * deterministic safety contract: any failure (bad image, no network) must return
 * the ORIGINAL buffer so a read is never broken by orientation handling.
 */
import { describe, it, expect } from 'vitest'
import { autoOrient } from '../autoOrient'

describe('autoOrient — fail-open', () => {
  it('returns the original buffer when the input is not a valid image', async () => {
    const junk = Buffer.from('not-an-image')
    const r = await autoOrient(junk, 'fake-key', 'gemini-3.1-pro-preview', 1)
    expect(r.buffer).toBe(junk)        // unchanged
    expect(r.applied).toBe(0)
  })

  it('returns the original on an empty buffer', async () => {
    const empty = Buffer.alloc(0)
    const r = await autoOrient(empty, 'fake-key', 'gemini-3.1-pro-preview', 1)
    expect(r.buffer).toBe(empty)
    expect(r.applied).toBe(0)
  })
})
