/**
 * visionExtract502.test.ts — P0 regression guard (triage 2026-06-06).
 *
 * Root cause of the "translator gives 0 results / HTTP 502" incident: the route's
 * final return used `{ status: ok ? 200 : 502 }`, so a valid request that simply
 * recognized ZERO fields (hard-case birth cert, blank/unsupported image) returned a
 * gateway-style HTTP 502. Cloudflare then masked the JSON body with a generic
 * "error code: 502" page and the client showed "HTTP 502" instead of a real message.
 *
 * Contract: zero recognition / per-page provider error are EXPECTED operational
 * outcomes — the route MUST return HTTP 200 with ok:false + status + error +
 * review_required in the body, NOT a 5xx. This is a source-level guard (same
 * approach as the other route wiring tests), no Gemini/provider mocking required.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'vision-extract', 'route.ts'),
  'utf-8',
)

describe('vision-extract — no-fields read must be HTTP 200, never 502', () => {
  it('the final response is no longer `status: ok ? 200 : 502`', () => {
    expect(SRC).not.toMatch(/status:\s*ok\s*\?\s*200\s*:\s*502/)
  })

  it('there is no 502 status anywhere in the route (no fields ≠ gateway error)', () => {
    expect(SRC).not.toMatch(/status:\s*502/)
  })

  it('the final NextResponse.json returns an unconditional 200', () => {
    // The terminal return (carries pages/ocr_field_safety) must end with { status: 200 }
    const tail = SRC.slice(SRC.lastIndexOf('ocr_field_safety: ocrFieldSafety'))
    expect(tail).toMatch(/\}\s*,\s*\{\s*status:\s*200\s*\}\s*\)/)
  })

  it('a zero-recognition result is marked review_required (never silent success)', () => {
    expect(SRC).toMatch(/ok\s*\?\s*\{\}\s*:\s*\{\s*review_required:\s*true\s*\}/)
  })

  it('still returns ok:false + an error message on the no-fields path', () => {
    expect(SRC).toMatch(/error:\s*lastResult\?\.error\s*\?\?\s*'No fields extracted across all pages\.'/)
  })

  it('genuine bad-request codes are preserved (400/413/415/429 unchanged)', () => {
    for (const code of [400, 413, 415, 429]) {
      expect(SRC).toMatch(new RegExp(`status:\\s*${code}`))
    }
  })
})
