/**
 * shadowWiring.test.ts — source-level guard: the ONE_BRAIN_SHADOW hook in the TPS
 * OCR route must be (a) flag-gated and (b) try/catch-wrapped, so it can NEVER
 * affect extraction. Node-env, same approach as the other route guards.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'extract', 'route.ts'),
  'utf-8',
)

describe('TPS route — ONE_BRAIN_SHADOW wiring is safe', () => {
  it('the shadow log is gated behind isShadowEnabled()', () => {
    expect(SRC).toMatch(/if \(mergedModule && isShadowEnabled\(\)\)/)
  })

  it('the shadow block is wrapped in try/catch (never affects the response)', () => {
    const block = SRC.slice(SRC.indexOf('ONE_BRAIN_SHADOW'))
    expect(block).toMatch(/try \{[\s\S]{0,400}summarizeTpsReviewShift[\s\S]{0,400}\} catch/)
  })

  it('the flag defaults OFF — extraction runs unchanged without it (no unconditional call)', () => {
    // summarizeTpsReviewShift must only appear inside the guarded block, never bare
    const calls = SRC.match(/summarizeTpsReviewShift\(/g) ?? []
    expect(calls.length).toBe(1)
  })
})
