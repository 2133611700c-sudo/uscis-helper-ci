/**
 * canonicalCutover.test.ts — GAP-2 source-level guards for the TPS OCR route.
 *
 * These pin the canonical-cutover contract at the route source (same proven
 * approach as shadowWiring.test.ts), covering invariants that are awkward to
 * exercise through the full Vision+Supabase integration:
 *
 *  1. Legacy *extraction* switch runs ONLY when moduleResult===null, so on
 *     Core success (coreStatus==='ok' sets moduleResult) the legacy brain /
 *     module extraction is structurally not re-run.
 *  2. The MRZ name-stability override is gated on the legacy path's needs and
 *     never re-derives a canonical value (Core injects MRZ itself).
 *  3. fallback_used / core_path semantics are present and derived from
 *     coreStatus — a technical Core failure is reported as a fallback, never
 *     hidden under 'ok'.
 *  4. Response data minimization: raw_text / words / lines and the PII value
 *     pairs (input_raw/input_normalized/output_normalized) are NOT in the
 *     client JSON; UI-required keys (module, document_id, knowledge_diagnostics
 *     field/status/reason/manual_required) remain.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, '..', 'extract', 'route.ts'),
  'utf-8',
)

// The slice of the SUCCESS response object literal returned to the client.
// Anchored on the unique `ok: true` success payload (not the earlier error
// returns), running to the end of the POST handler.
const RESPONSE_BLOCK = ROUTE.slice(
  ROUTE.indexOf('ok: true,'),
  ROUTE.indexOf('export async function GET'),
)

describe('TPS route — canonical cutover: legacy gating (GAP-2)', () => {
  it('the legacy extraction switch runs ONLY when moduleResult === null', () => {
    // On coreStatus==='ok' moduleResult is set, so this guard skips the
    // entire legacy switch (brain / module extraction not re-run).
    expect(ROUTE).toMatch(/if \(moduleResult === null\) \{[\s\S]*switch \(docTypeHint\)/)
  })

  it('coreStatus is set to ok only when canonical fields are produced', () => {
    expect(ROUTE).toMatch(/moduleResult = canonicalToTpsModuleResult\([\s\S]{0,80}coreStatus = 'ok'/)
  })

  it('the R1B MRZ name-stability override is gated OFF on Core success (no post-canonical MRZ override)', () => {
    // The deterministic raw_text MRZ re-parse + title-case force-override exists
    // only to stabilize the LEGACY Brain path's non-deterministic name source.
    // On coreStatus==='ok' the canonical (MRZ-injected, arbitrated) name is
    // authoritative; re-overriding it would mutate the controlling-Latin value
    // (e.g. "IVANENKO" → "Ivanenko"). The guard MUST require coreStatus!=='ok'.
    expect(ROUTE).toMatch(/if \(coreStatus !== 'ok' && mergedModule && effectiveOcrResult\.raw_text\)/)
  })
})

describe('TPS route — canonical cutover: fallback semantics (GAP-2)', () => {
  it('fallback_used is true ONLY on a technical Core failure (error)', () => {
    expect(ROUTE).toMatch(/const fallbackUsed = coreStatus === 'error'/)
  })

  it('core_path is canonical on ok, legacy_fallback on error', () => {
    expect(ROUTE).toMatch(
      /coreStatus === 'ok' \? 'canonical' : coreStatus === 'error' \? 'legacy_fallback'/,
    )
  })

  it('the response surfaces fallback_used and core_path', () => {
    expect(RESPONSE_BLOCK).toMatch(/fallback_used: fallbackUsed/)
    expect(RESPONSE_BLOCK).toMatch(/core_path: corePath/)
  })

  it('a fallback is never hidden under coreStatus ok — fallbackUsed keys off error, not ok', () => {
    // Defensive: ensure we did not accidentally derive fallbackUsed from 'ok'.
    expect(ROUTE).not.toMatch(/fallbackUsed = coreStatus === 'ok'/)
  })
})

describe('TPS route — canonical cutover: response data minimization (GAP-2)', () => {
  it('raw_text is NOT returned in the client JSON', () => {
    expect(RESPONSE_BLOCK).not.toMatch(/^\s*raw_text:/m)
  })

  it('words / lines raw OCR arrays are NOT returned in the client JSON', () => {
    expect(RESPONSE_BLOCK).not.toMatch(/^\s*words: result\.words/m)
    expect(RESPONSE_BLOCK).not.toMatch(/^\s*lines: result\.lines/m)
  })

  it('client knowledge_diagnostics carries ONLY field/status/reason/manual_required (no PII value pairs)', () => {
    const kd = RESPONSE_BLOCK.slice(
      RESPONSE_BLOCK.indexOf('knowledge_diagnostics:'),
      RESPONSE_BLOCK.indexOf('knowledge_diagnostics:') + 320,
    )
    expect(kd).toMatch(/field: d\.field/)
    expect(kd).toMatch(/status: d\.status/)
    expect(kd).toMatch(/reason: d\.reason/)
    expect(kd).toMatch(/manual_required: d\.manual_required/)
    expect(kd).not.toMatch(/input_raw/)
    expect(kd).not.toMatch(/input_normalized/)
    expect(kd).not.toMatch(/output_normalized/)
  })

  it('UI-required response keys remain (module, document_id, vision_text_length)', () => {
    expect(RESPONSE_BLOCK).toMatch(/^\s*module: mergedModule/m)
    expect(RESPONSE_BLOCK).toMatch(/document_id,/)
    expect(RESPONSE_BLOCK).toMatch(/vision_text_length:/)
  })
})
