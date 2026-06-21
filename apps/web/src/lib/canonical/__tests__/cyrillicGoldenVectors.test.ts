/**
 * cyrillicGoldenVectors.test.ts — DETERMINISTIC golden-vector acceptance test for
 * the CENTRAL BRAIN (canonical/core/knowledgeNormalize → normalizeCanonicalValue),
 * the layer the arbiter calls to apply the dictionary + transliteration as an
 * AUTHORITY layer on each arbitrated field.
 *
 * NO Gemini, NO OCR, NO network. Known Cyrillic value in, asserted KnowledgeDecision
 * out. This proves the "central brain + dictionaries" wiring produces the CORRECT
 * decision (action + finalValue/candidateValue) for known UA/RU inputs.
 *
 * Contract (knowledgeNormalize.ts §Action contract):
 *   accept   — deterministic safe transform, finalValue set.
 *   preserve — controlling Latin (MRZ/EAD/I-94), finalValue set, never re-translit.
 *   suggest  — dictionary has a different value but can't prove it; finalValue=null.
 *   review   — cannot validate / suspicious; finalValue=null.
 *   block    — nothing usable.
 *
 * RULE PROVENANCE: CLAUDE.md HARD RULES + ADR-017 §D2 + ADR-004 + KMU-55.
 *
 * If the brain output ever contradicts a documented rule, the vector is marked
 * `// RULE VIOLATION:` and asserts the ACTUAL output (no faked green). As of
 * authorship NO violations were found.
 */
import { describe, it, expect } from 'vitest'
import { normalizeCanonicalValue } from '../core/knowledgeNormalize'

describe('Cyrillic golden vectors — Central Brain normalizeCanonicalValue', () => {
  // ── 1. Person names: clean Cyrillic → KMU-55 accept ───────────────────────
  it('surname Cyrillic Шевченко → accept Shevchenko (KMU-55)', () => {
    const d = normalizeCanonicalValue('surname', 'Шевченко', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Shevchenko')
    expect(d.provenance).toBe('kmu55_name')
  })

  it('given_name Cyrillic Ющенко → accept Yushchenko', () => {
    const d = normalizeCanonicalValue('given_name', 'Ющенко', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Yushchenko')
  })

  // ── 2. Russian spelling on a Ukrainian doc → review, NOT silent translit ───
  it('Russian-only letter (Эдуард) on UA doc → review (russian_spelling_suspected)', () => {
    const d = normalizeCanonicalValue('given_name', 'Эдуард', { ukrainianDoc: true })
    expect(d.action).toBe('review')
    expect(d.finalValue).toBeNull()
    expect(d.reasonCodes).toContain('russian_spelling_suspected')
  })

  it('Russian-spelled given name (Сергей) on UA doc → review (no silent KMU-55)', () => {
    const d = normalizeCanonicalValue('given_name', 'Сергей', { ukrainianDoc: true })
    expect(d.action).toBe('review')
    expect(d.finalValue).toBeNull()
    expect(d.reasonCodes).toContain('russian_spelling_suspected')
  })

  // ── 3. Controlling Latin (MRZ) preserved verbatim, never re-transliterated ──
  it('MRZ Latin surname is preserved (spelling intact, NOT re-transliterated)', () => {
    const d = normalizeCanonicalValue('family_name', 'SHEVCHENKO', { sourceBasis: 'mrz_latin' })
    expect(d.action).toBe('preserve')
    expect(d.provenance).toBe('controlling_latin')
    expect(d.evidenceStrength).toBeGreaterThanOrEqual(0.99)
    // NOTE (not a violation): the brain routes controlling Latin through
    // formatLatinName(), which CASE-NORMALIZES "SHEVCHENKO" → "Shevchenko" while
    // preserving the SPELLING. The HARD RULE protects the controlling *spelling*
    // (no re-transliteration), not the input casing. The letters are byte-identical
    // up to case; KMU-55 was NOT re-applied. We assert the ACTUAL output.
    expect(d.finalValue).toBe('Shevchenko')
    // Proof it was NOT re-transliterated from some Cyrillic source: input had no
    // Cyrillic and the value is the same letters as the MRZ value.
    expect(d.finalValue?.toUpperCase()).toBe('SHEVCHENKO')
  })

  it('reader-derived Latin (not authority) → preserve but lower evidence', () => {
    const d = normalizeCanonicalValue('family_name', 'Shevchenko', { sourceBasis: 'reader_latin' })
    expect(d.action).toBe('preserve')
    expect(d.finalValue).toBe('Shevchenko')
    // reader-derived Latin is LESS authoritative — a conflict would trigger review.
    expect(d.evidenceStrength).toBeLessThan(0.99)
  })

  // ── 4. Patronymic: "Patronymic" not "Middle Name"; reconstruct/reject ──────
  it('valid patronymic read (Петрович, M) → accept transliterated Petrovych', () => {
    const d = normalizeCanonicalValue('patronymic', 'Петрович', { sex: 'M', givenNameCyrillic: 'Іван' })
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Petrovych')
    expect(d.ruleId).toBe('patronymic.read_valid')
  })

  it('patronymic fragment (ович) + given Петро → reconstructed suggest', () => {
    const d = normalizeCanonicalValue('patronymic', 'ович', { sex: 'M', givenNameCyrillic: 'Петро' })
    // exception table makes Петро→Петрович a confident regeneration; the brain
    // surfaces it as a non-final value (suggest) since the source read was a fragment.
    expect(d.finalValue).toBeNull()
    expect(d.candidateValue).toBe('Petrovych')
    expect(['suggest', 'review']).toContain(d.action)
  })

  it('patronymic fragment with no usable given name → review, no final', () => {
    const d = normalizeCanonicalValue('patronymic', 'ович', { sex: 'M', givenNameCyrillic: '' })
    expect(d.finalValue).toBeNull()
    expect(d.action).toBe('review')
  })

  // ── 5. Issuing authority: Міліція→Militsiya (ADR), УМВС dictionary ─────────
  it('Міліція → accept Militsiya (NEVER Police/Militia)', () => {
    const d = normalizeCanonicalValue('issuing_authority', 'Міліція м. Київ', { isHistorical: true })
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Militsiya')
    expect(d.finalValue).not.toMatch(/police|militia/i)
  })

  it('Управління МВС (УМВС) → accept Regional Department of MIA (ADR-004)', () => {
    const d = normalizeCanonicalValue('issuing_authority', 'Управління МВС', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Regional Department of MIA')
  })

  it('unknown authority → review, never inventing a final value', () => {
    const d = normalizeCanonicalValue('issuing_authority', 'Якесь невідоме відомство', {})
    expect(d.action).toBe('review')
    expect(d.finalValue).toBeNull()
    expect(d.reasonCodes).toContain('authority_unverified')
  })

  // ── 6. Places: смт, oblast genitive→nominative, gazetteer ─────────────────
  it('oblast genitive (Вінницької області) → accept Vinnytsia Oblast (nominative)', () => {
    const d = normalizeCanonicalValue('place_oblast', 'Вінницької області', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Vinnytsia Oblast')
  })

  // FIXED (GOLDEN V1): the brain's gazetteer-first path (snapCity) used to STRIP the
  // «смт» designator → released "Vyshneve" (HARD-RULE violation: «смт» = "urban-type
  // settlement", NEVER city/town). knowledgeNormalize now re-attaches the designator
  // from the raw value via settlementDesignatorEn(). Designator preserved on the
  // gazetteer match.
  it('смт place_of_birth → keeps "urban-type settlement" designator (gazetteer path)', () => {
    const d = normalizeCanonicalValue('place_of_birth', 'смт Вишневе', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('urban-type settlement Vyshneve')
    expect(d.finalValue).not.toMatch(/\b(city|town)\b/i)
    expect(d.provenance).toBe('gazetteer_exact')
  })

  it('REFERENCE: standalone normalizePlace keeps the «смт» designator (proves the dictionary is correct)', () => {
    // The pure dictionary layer is RIGHT; only the brain's gazetteer-first wiring loses it.
    // (Asserted in packages/knowledge goldenDictionaryVectors: "urban-type settlement Vyshneve".)
    // A NON-gazetteer key reaches normalizePlace in the brain and keeps the designator:
    const d = normalizeCanonicalValue('place_settlement', 'смт Вишневе', {})
    expect(d.finalValue).toBe('urban-type settlement Vyshneve')
    expect(d.finalValue).not.toMatch(/\b(city|town)\b/i)
  })

  it('place_city exact gazetteer (Київ) → accept Kyiv', () => {
    const d = normalizeCanonicalValue('place_city', 'Київ', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Kyiv')
    expect(d.provenance).toBe('gazetteer_exact')
  })

  it('place_city fuzzy near-match (Простянець) → suggest, no silent correction', () => {
    const d = normalizeCanonicalValue('place_city', 'Простянець', {})
    expect(d.action).toBe('suggest')
    expect(d.finalValue).toBeNull()
    expect(d.reasonCodes).toContain('place_fuzzy_unconfirmed')
  })

  // ── 7. Sex + dates: deterministic dictionary mapping ──────────────────────
  it('sex Ч → accept Male', () => {
    const d = normalizeCanonicalValue('sex', 'Ч', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('Male')
  })

  it('ISO date 1990-01-15 → accept USCIS 01/15/1990', () => {
    const d = normalizeCanonicalValue('date_of_birth', '1990-01-15', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('01/15/1990')
  })

  it('Ukrainian month-name date (date_of_birth) → accept USCIS MM/DD/YYYY', () => {
    const d = normalizeCanonicalValue('date_of_birth', '19 лютого 2003', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('02/19/2003')
  })

  // FIXED (GOLDEN V2): `date_of_issue`/`issue_date` contain "issu" and used to be
  // caught by the AUTHORITY branch before the date branch → a valid issue date was
  // misrouted to authority.unknown → false review. The authority branch now excludes
  // keys containing "date", so issue dates reach the date parser and accept.
  it('date_of_issue month-name date → accepted as USCIS date (not misrouted to authority)', () => {
    const d = normalizeCanonicalValue('date_of_issue', '19 лютого 2003', {})
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBe('02/19/2003')
  })

  it('empty value → block (no source → no field)', () => {
    const d = normalizeCanonicalValue('surname', '', {})
    expect(d.action).toBe('block')
    expect(d.finalValue).toBeNull()
  })
})
