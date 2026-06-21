/**
 * visionExtractLegacyCutover.test.ts — Phase 1 GAP-1: legacy-fallback canonical cutover.
 *
 * Before this cutover the route's legacy fallback raw-merged docintel
 * ExtractedDocField[] straight into a Map<string,FieldOut>, BYPASSING the canonical
 * pipeline (docintelToCandidate → applyKnowledgeBrainIfEnabled → buildCanonicalResult
 * → toTranslationRows). Consequences: C3-rejected fields (finalValue===null) could
 * surface, the settlement-designator/getCanonicalValue logic was skipped, and the
 * fallback was not marked.
 *
 * This file proves two things:
 *   A) CONTROL FLOW (source-level, same approach as visionExtract502 /
 *      visionExtractCorePath — no provider mocking): the legacy block now runs the
 *      SAME arbitration as the Core path, marks itself honestly (fallback_used /
 *      core_path), and is reached only AFTER the Core return.
 *   B) C3 / canonical GUARANTEE (unit-level, exercising the REAL adapter the
 *      fallback now calls): a C3-rejected field does not surface its value;
 *      controlling-Latin is verbatim; rawCyrillic / reviewReasons / suggestedValue
 *      are carried. Synthetic data only — no PII.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { toTranslationRows } from '@/lib/canonical/core/translationAdapter'
import type { CanonicalField } from '@/lib/canonical/types'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'vision-extract', 'route.ts'),
  'utf-8',
)

describe('A) control flow — legacy fallback is now the canonical pipeline + marked', () => {
  it('the legacy block collects candidates (docintelToCandidate), not a raw FieldOut merge', () => {
    // The old raw-merge accumulator (Map<string,FieldOut> named `merged`) is gone.
    expect(SRC).not.toMatch(/const\s+merged\s*=\s*new\s+Map<string,\s*FieldOut>/)
    // It collects candidates carrying the page, exactly like the Core path.
    expect(SRC).toMatch(/legacyCandidates\.push\(\.\.\.r\.fields\.map\(\(f\)\s*=>\s*docintelToCandidate\(f,\s*p\.page\)\)\)/)
  })

  it('the legacy block runs the SAME arbitration + builds the canonical result', () => {
    const legacyKb = SRC.indexOf('const legacyCanonicalFields = applyKnowledgeBrainIfEnabled(')
    const legacyBuild = SRC.indexOf('const legacyCanonicalResult = buildCanonicalResult(')
    const legacyRows = SRC.indexOf('toTranslationRows(legacyCanonicalResult.fields')
    expect(legacyKb).toBeGreaterThan(-1)
    expect(legacyBuild).toBeGreaterThan(legacyKb)
    expect(legacyRows).toBeGreaterThan(legacyBuild)
  })

  it('Core success is marked canonical / fallback_used:false', () => {
    expect(SRC).toMatch(/core_path:\s*'canonical'/)
    expect(SRC).toMatch(/fallback_used:\s*false/)
  })

  it('the legacy response is marked legacy_fallback / fallback_used:true', () => {
    expect(SRC).toMatch(/core_path:\s*'legacy_fallback'/)
    expect(SRC).toMatch(/fallback_used:\s*true/)
  })

  it('the legacy canonical pipeline sits strictly AFTER the Core success return', () => {
    const coreReturn = SRC.indexOf("status: 'ok:core-b2'")
    const legacyBuild = SRC.indexOf('const legacyCanonicalResult = buildCanonicalResult(')
    expect(coreReturn).toBeGreaterThan(-1)
    expect(legacyBuild).toBeGreaterThan(coreReturn)
  })

  it('the legacy provider/model are NOT relabeled canonical (real reader kept)', () => {
    // The legacy terminal response still reports the real reader provider/model,
    // not the one-brain-core provider string the Core return uses.
    const tail = SRC.slice(SRC.indexOf('core_path: \'legacy_fallback\''))
    expect(tail).toMatch(/provider:\s*lastResult\?\.provider\s*\?\?\s*null/)
    expect(tail).toMatch(/model:\s*lastResult\?\.model\s*\?\?\s*null/)
  })
})

/** Minimal valid CanonicalField factory — synthetic, no PII. */
function field(over: Partial<CanonicalField> & { key: string }): CanonicalField {
  return {
    key: over.key,
    rawValue: over.rawValue ?? null,
    normalizedValue: over.normalizedValue ?? null,
    finalValue: over.finalValue,
    suggestedValue: over.suggestedValue,
    criticality: over.criticality ?? 'critical',
    confidence: over.confidence ?? { ocr: 0.9, field_match: 0.9, normalization: 0.9, source_match: null, final: 0.9 },
    source: over.source ?? 'ai_vision',
    reviewRequired: over.reviewRequired ?? false,
    reviewReasons: over.reviewReasons ?? [],
    evidence: over.evidence ?? [],
    rawCyrillic: over.rawCyrillic,
    knowledgeRule: over.knowledgeRule,
    rejectedReason: over.rejectedReason,
  } as CanonicalField
}

describe('B) canonical guarantee — the adapter the legacy fallback now calls', () => {
  it('a C3-rejected field (finalValue===null) does NOT surface its value, but keeps rawCyrillic', () => {
    const rejected = field({
      key: 'patronymic',
      rawValue: 'HRYHOROVYCH',          // synthetic — a value C3 deliberately rejected
      normalizedValue: 'HRYHOROVYCH',
      finalValue: null,                  // C3 ran and rejected
      reviewRequired: true,
      reviewReasons: ['low_confidence_critical'],
      rawCyrillic: 'григорович',
    })
    const [row] = toTranslationRows([rejected], new Map())
    // The raw-merge bypass would have surfaced 'HRYHOROVYCH' here; the canonical
    // path returns null (getCanonicalValue honors C3: finalValue===null → null).
    expect(row.value).toBeNull()
    // rawCyrillic is preserved (so the review screen still shows the source glyphs).
    expect(row.raw_cyrillic).toBe('григорович')
    // Review state is carried and never downgraded.
    expect(row.review_required).toBe(true)
    expect(row.review_reasons).toEqual(['low_confidence_critical'])
  })

  it('controlling-Latin (C3-accepted finalValue string) is released VERBATIM', () => {
    const accepted = field({
      key: 'passport_number',
      rawValue: 'AA000000',
      normalizedValue: 'aa000000',      // a different normalization must NOT win
      finalValue: 'AA000000',           // C3 accepted this exact controlling spelling
      criticality: 'critical',
    })
    const [row] = toTranslationRows([accepted], new Map())
    expect(row.value).toBe('AA000000')  // verbatim, not the lowercased normalization
  })

  it('suggestedValue (fuzzy alternative) is carried through to the row, never auto-applied', () => {
    const withSuggestion = field({
      key: 'place_of_residence',
      rawValue: 'KYIV',
      normalizedValue: 'KYIV',
      finalValue: 'KYIV',
      suggestedValue: 'KYYIV',          // synthetic alternative spelling for review
    })
    const [row] = toTranslationRows([withSuggestion], new Map())
    expect(row.value).toBe('KYIV')
    expect(row.suggested_value).toBe('KYYIV')
  })

  it('settlement-designator is applied exactly ONCE (no double-add) for place keys', () => {
    // «смт Тростянець» → the «смт» designator becomes an English prefix once.
    const city = field({
      key: 'place_of_birth',
      rawValue: 'Trostianets',
      normalizedValue: 'Trostianets',
      finalValue: 'Trostianets',
      rawCyrillic: 'смт Тростянець',
    })
    const [row] = toTranslationRows([city], new Map())
    expect(row.value).toMatch(/urban-type settlement/i)
    // exactly once — the guard prevents the designator from being prepended twice.
    expect((row.value!.match(/urban-type settlement/gi) || []).length).toBe(1)
  })
})
