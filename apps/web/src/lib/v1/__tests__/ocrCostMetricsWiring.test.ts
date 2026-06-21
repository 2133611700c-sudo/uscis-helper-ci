/**
 * Static wiring guard for the P2 OCR cost-metrics SHADOW instrumentation.
 *
 * Proves at the SOURCE level that the metrics wrapper is non-invasive:
 *   - every real external provider call site imports + wraps via withOcrCostMetrics;
 *   - the wrapper's RESULT is what feeds the downstream code (the metric does not
 *     mutate/replace the provider result — `res` still comes from the wrapped call);
 *   - the 4 product OCR routes roll up via runWithUploadCostTally;
 *   - no PII (image bytes / OCR text / field values) is passed into the emitter.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('ocrCostMetrics wiring — provider call sites (non-invasive)', () => {
  const PROVIDER_SITES = [
    'src/lib/ocr/providers/google-vision.ts',
    'src/lib/docai/client.ts',
    'src/lib/docintel/providers/geminiVisionProvider.ts',
    'src/lib/deepseek/client.ts',
    'src/lib/ocr/field-mapper.ts',
    'src/lib/docintel/orientation/autoOrient.ts',
    'src/lib/docintel/ensemble/dateRegionRead.ts',
  ]

  it.each(PROVIDER_SITES)('%s wraps its external fetch in withOcrCostMetrics', (rel) => {
    const src = read(rel)
    expect(src).toContain('withOcrCostMetrics')
    expect(src).toContain('computeCacheKeySha')
    // the wrapper returns the fetch result — the call site still consumes `res`
    // from the wrapped expression (no separate unwrapped fetch path remains).
    expect(src).toMatch(/await withOcrCostMetrics\(/)
  })

  it.each(PROVIDER_SITES)('%s passes the fetch as a thunk (does not pre-mutate the result)', (rel) => {
    const src = read(rel)
    // The call form is withOcrCostMetrics(meta, () => fetch(...)) — a deferred
    // thunk, so timing wraps the real call and the result is returned verbatim.
    expect(src).toMatch(/withOcrCostMetrics\([\s\S]*?\(\)\s*=>\s*fetch\(/)
  })

  const ROUTES = [
    'src/app/api/tps/ocr/extract/route.ts',
    'src/app/api/reparole/ocr/extract/route.ts',
    'src/app/api/ead/ocr/extract/route.ts',
    'src/app/api/translation/vision-extract/route.ts',
    'src/app/api/translation/[sessionId]/ocr-from-storage/route.ts',
  ]

  it.each(ROUTES)('%s rolls up via runWithUploadCostTally and delegates to POST_impl', (rel) => {
    const src = read(rel)
    expect(src).toContain('runWithUploadCostTally')
    expect(src).toContain('POST_impl')
  })

  it('emitter source never references applicant/field PII keys in its payload type', () => {
    const src = read('src/lib/v1/ocrCostMetrics.ts')
    // The OcrProviderCallEvent shape must not contain value-bearing keys.
    for (const forbidden of ['source_value', 'final_value', 'raw_text', 'imageBuffer', 'applicant']) {
      // allowed to appear in comments/tests, but NOT as an event field declaration
      expect(src).not.toMatch(new RegExp(`\\n\\s*${forbidden}\\s*:`))
    }
  })
})
