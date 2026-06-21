/**
 * visionExtractCorePath.test.ts — Phase 1 (Agent 2): Core-path wiring guard.
 *
 * Asserts (source-level, no provider mocking — same approach as visionExtract502)
 * that the Core path:
 *   1. builds the ONE canonical envelope (buildCanonicalResult) from the arbitrated
 *      fields, and the product adapter reads from result.fields — not a bare array;
 *   2. on Core success returns status 'ok:core-b2' and does NOT enter the legacy
 *      reader (the legacy fallthrough lives strictly after the Core return).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'vision-extract', 'route.ts'),
  'utf-8',
)

describe('vision-extract — Core path consumes canonical result', () => {
  it('imports and calls buildCanonicalResult on the Core path', () => {
    expect(SRC).toMatch(/import\s*\{\s*buildCanonicalResult\s*\}\s*from\s*'@\/lib\/canonical\/core\/buildCanonicalResult'/)
    expect(SRC).toMatch(/const\s+canonicalResult\s*=\s*buildCanonicalResult\(/)
  })

  it('the product adapter reads from the canonical result, not the bare array', () => {
    expect(SRC).toMatch(/toTranslationRows\(\s*canonicalResult\.fields\s*,/)
  })

  it("Core success returns status 'ok:core-b2' (the live Core return)", () => {
    expect(SRC).toMatch(/status:\s*'ok:core-b2'/)
  })

  it('the Core return precedes the legacy fallthrough (legacy is NOT entered on Core success)', () => {
    const coreReturnIdx = SRC.indexOf("status: 'ok:core-b2'")
    const legacyMarker = SRC.indexOf('falling through to legacy reader')
    expect(coreReturnIdx).toBeGreaterThan(-1)
    expect(legacyMarker).toBeGreaterThan(-1)
    // The legacy fallthrough warning/return must sit AFTER the Core success return.
    expect(legacyMarker).toBeGreaterThan(coreReturnIdx)
  })

  it('the canonical result is built BEFORE the product rows are produced', () => {
    const buildIdx = SRC.indexOf('const canonicalResult = buildCanonicalResult(')
    const rowsIdx = SRC.indexOf('toTranslationRows(canonicalResult.fields')
    expect(buildIdx).toBeGreaterThan(-1)
    expect(rowsIdx).toBeGreaterThan(buildIdx)
  })
})
