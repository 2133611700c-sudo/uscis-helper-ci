import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readBookletViaVision, visionReadsToFields } from '../geminiVisionArbiter'

/**
 * LIVE integration test — exercises the real production code path against the
 * live Gemini API on the owner's own booklet. SELF-SKIPS unless RUN_LIVE_VISION=1
 * so CI never hits the network. Run manually:
 *   RUN_LIVE_VISION=1 pnpm --filter web run test -- geminiVisionArbiter.live
 */
const LIVE = process.env.RUN_LIVE_VISION === '1'
const ROOT = path.resolve(__dirname, '../../../../../../..') // repo root
const IMG = path.join(ROOT, 'qa-shots/private/booklet_test_resized.jpg')

describe.skipIf(!LIVE)('geminiVisionArbiter — LIVE (owner booklet)', () => {
  beforeAll(() => {
    if (!process.env.GEMINI_API_KEY) {
      const env = fs.readFileSync(path.join(ROOT, 'apps/web/.env.local'), 'utf8')
      process.env.GEMINI_API_KEY = (env.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
    }
  })

  it('reads Cyrillic from image and KMU-55 produces correct Latin end-to-end', async () => {
    const buf = fs.readFileSync(IMG)
    const res = await readBookletViaVision(buf, 'image/jpeg', { timeoutMs: 20000, attemptsPerModel: 3 })
    // eslint-disable-next-line no-console
    console.log('LIVE vision result:', JSON.stringify({ ok: res.ok, model: res.model, ms: res.ms, error: res.error }))
    expect(res.ok).toBe(true)

    const fields = visionReadsToFields(res.fields, 'doc_live')
    const by = Object.fromEntries(fields.map((f) => [f.field, f.normalized_value]))
    // eslint-disable-next-line no-console
    console.log('LIVE final fields (Cyrillic→KMU-55):', JSON.stringify(by))

    expect(by.family_name).toBe('Ivanenko')
    expect(by.middle_name).toBe('Petrovych') // was "Yovych" in prod
    expect(by.city_of_birth).toBe('Vinnytsia') // was "Prostianets" in prod
  }, 90000)
})
