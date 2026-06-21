/**
 * postExtractNormalizeCanonical.test.ts — GAP-2 canonical cutover.
 *
 * When a field carries extraction_source==='canonical_core' (produced by the
 * Document Core arbitration), postExtractNormalize MUST NOT re-apply the
 * semantic normalization that the Core already performed (oblast
 * genitive→nominative, KMU-55 transliteration, place normalization,
 * name/patronymic re-translit, country validation). It is allowed to apply
 * PRODUCT_FORMATTING_ONLY (date US→ISO) because the I-821 PDF needs ISO and
 * that does not change the semantic value.
 *
 * Synthetic data only — no real PII.
 */
import { describe, expect, it } from 'vitest'
import { postExtractNormalize } from '../ocr/postExtractNormalize'
import type { TpsExtractedField, TpsExtractionSource } from '../types'

function mkField(
  field: string,
  raw: string,
  normalized: string | null,
  source: TpsExtractionSource = 'ocr_visual',
): TpsExtractedField {
  return {
    field,
    raw_value: raw,
    normalized_value: normalized,
    extraction_source: source,
    source_document_id: 'doc_synthetic_1',
    source_zone: 'synthetic',
    bbox: null,
    language_layer: 'mixed',
    confidence: 0.95,
    review_required: false,
    ocr_word_ids: [],
    passes: [],
    failures: [],
    user_corrected: false,
  }
}

describe('postExtractNormalize — canonical_core cutover (GAP-2)', () => {
  it('does NOT re-transliterate a canonical family_name (Latin value preserved verbatim)', () => {
    // Legacy path would title-case "SHEVCHENKO" → "Shevchenko".
    // Canonical value is authoritative (came from MRZ/arbitration) → unchanged.
    const input = [mkField('family_name', 'SHEVCHENKO', 'SHEVCHENKO', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('SHEVCHENKO')
    expect(out.rejected_fields).not.toContain('family_name')
    expect(out.diagnostics[0]?.reason).toBe('canonical_core_no_renormalize')
  })

  it('does NOT re-normalize a canonical province_of_birth (no oblast genitive pass)', () => {
    // A legacy raw "VINNYTSKA OBL." would be rewritten to "Vinnytsia Oblast".
    // The canonical value is already final → must pass through unchanged.
    const input = [mkField('province_of_birth', 'VINNYTSKA OBL.', 'Vinnytsia Oblast', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('Vinnytsia Oblast')
    expect(out.diagnostics[0]?.status).toBe('passed')
  })

  it('does NOT strip a canonical city_of_birth nor re-run normalizePlace', () => {
    const input = [mkField('city_of_birth', 'смт. Устинівка', 'Ustynivka', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('Ustynivka')
    expect(out.rejected_fields).not.toContain('city_of_birth')
  })

  it('does NOT re-validate a canonical patronymic', () => {
    const input = [mkField('patronymic', 'Тарасович', 'Tarasovych', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('Tarasovych')
    expect(out.rejected_fields).not.toContain('patronymic')
  })

  it('does NOT reject a canonical country field via the legacy country whitelist', () => {
    // "Ukraine" is in the legacy whitelist, but a canonical value the Core
    // already validated must not depend on that route-local list at all.
    const input = [mkField('country_of_birth', 'Україна', 'Ukraine', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('Ukraine')
    expect(out.rejected_fields).not.toContain('country_of_birth')
  })

  it('STILL applies date US→ISO formatting to a canonical dob (PRODUCT_FORMATTING_ONLY)', () => {
    // The I-821 PDF needs ISO. The transform does not change the semantic
    // instant, so it is permitted even for canonical fields.
    const input = [mkField('dob', '01/25/1990', '01/25/1990', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('1990-01-25')
  })

  it('leaves an already-ISO canonical dob untouched', () => {
    const input = [mkField('dob', '1990-01-25', '1990-01-25', 'canonical_core')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('1990-01-25')
  })

  it('emits a passed diagnostic for canonical fields so the wizard still sees them', () => {
    const input = [mkField('family_name', 'KOVALENKO', 'KOVALENKO', 'canonical_core')]
    const out = postExtractNormalize(input)
    const diag = out.diagnostics.find((d) => d.field === 'family_name')
    expect(diag?.status).toBe('passed')
    expect(diag?.manual_required).toBe(false)
  })

  it('legacy (non-canonical) fields are STILL re-normalized (regression guard)', () => {
    // The cutover must be surgical: only canonical_core is bypassed.
    const input = [mkField('province_of_birth', 'VINNYTSKA OBL.', 'VINNYTSKA OBL.', 'ocr_visual')]
    const out = postExtractNormalize(input)
    expect(out.fields[0].normalized_value).toBe('Vinnytsia Oblast')
  })

  it('mixed batch: canonical bypassed, legacy normalized, in one call', () => {
    const input = [
      mkField('family_name', 'SHEVCHENKO', 'SHEVCHENKO', 'canonical_core'),
      mkField('province_of_birth', 'VINNYTSKA OBL.', 'VINNYTSKA OBL.', 'ocr_visual'),
    ]
    const out = postExtractNormalize(input)
    const fam = out.fields.find((f) => f.field === 'family_name')
    const prov = out.fields.find((f) => f.field === 'province_of_birth')
    expect(fam?.normalized_value).toBe('SHEVCHENKO') // canonical: untouched
    expect(prov?.normalized_value).toBe('Vinnytsia Oblast') // legacy: normalized
  })
})
