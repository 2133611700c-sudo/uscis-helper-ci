/**
 * sovietBilingualTolerance.test.ts — BUG D: Soviet-bilingual / Russian-spelling tolerance.
 *
 * Pins the CURRENT behavior of normalizeCanonicalValue (D2 knowledge layer):
 *   - On a Ukrainian identity doc (ukrainianDoc !== false), a Russian-spelled given
 *     name is SUSPECT → review with 'russian_spelling_suspected' (a misread, not a
 *     fact to transliterate silently).
 *   - On a NON-Ukrainian doc (Soviet bilingual, ukrainianDoc === false), the same
 *     Russian spelling is accepted as-written (the page legitimately bears it) — the
 *     RU-spelling review rule does NOT fire.
 *
 * Pure unit (no AI, no I/O). 'Андрей' is in the conservative RU_SPELLED_GIVEN seed.
 */
import { describe, it, expect } from 'vitest'
import { normalizeCanonicalValue } from '../knowledgeNormalize'

describe('BUG D — Soviet-bilingual Russian-spelling tolerance', () => {
  it('Ukrainian doc + Russian-spelled given name → review (russian_spelling_suspected)', () => {
    const d = normalizeCanonicalValue('given_name', 'Андрей', { ukrainianDoc: true })
    expect(d.action).toBe('review')
    expect(d.ruleId).toBe('name.russian_spelling_on_ua')
    expect(d.reasonCodes).toContain('russian_spelling_suspected')
  })

  it('undefined ukrainianDoc defaults to suspicious (!== false) → still review', () => {
    const d = normalizeCanonicalValue('given_name', 'Андрей', {})
    expect(d.ruleId).toBe('name.russian_spelling_on_ua')
    expect(d.reasonCodes).toContain('russian_spelling_suspected')
  })

  it('NON-Ukrainian doc (ukrainianDoc=false) + same Russian spelling → RU-rule does NOT fire', () => {
    const d = normalizeCanonicalValue('given_name', 'Андрей', { ukrainianDoc: false })
    expect(d.ruleId).not.toBe('name.russian_spelling_on_ua')
    expect(d.reasonCodes).not.toContain('russian_spelling_suspected')
  })

  it('NON-Ukrainian doc + Ukrainian-spelled name → also not flagged by the RU rule', () => {
    const d = normalizeCanonicalValue('given_name', 'Андрій', { ukrainianDoc: false })
    expect(d.reasonCodes).not.toContain('russian_spelling_suspected')
  })

  it('full_name composite WITH an orthographic signal (ё/э/ы/ъ) shows the doc-origin distinction', () => {
    // 'Эдуард Семёнович' carries Russian-only letters (Э, ё) → looksRussianSpelled fires.
    const ua = normalizeCanonicalValue('father_full_name', 'Эдуард Семёнович', { ukrainianDoc: true })
    expect(ua.reasonCodes).toContain('russian_spelling_suspected')
    const soviet = normalizeCanonicalValue('father_full_name', 'Эдуард Семёнович', { ukrainianDoc: false })
    expect(soviet.reasonCodes).not.toContain('russian_spelling_suspected')
  })

  // ── KNOWN GAP (pinned, not hidden) ──────────────────────────────────────────
  // looksRussianSpelled() matches a composite full_name against the SINGLE-name
  // RU_SPELLED_GIVEN set, so a multi-word Russian name with NO orthographic signal
  // (no ы/э/ё/ъ) — e.g. 'Андрей Андреевич' — is NOT flagged even on a Ukrainian doc.
  // The single-token path DOES catch 'Андрей'. This pins the current limitation;
  // tightening it (token-wise RU check on composites) needs owner GT + a rule change.
  it('GAP: composite RU full_name without ё/э/ы/ъ is NOT detected even on a UA doc', () => {
    const ua = normalizeCanonicalValue('father_full_name', 'Андрей Андреевич', { ukrainianDoc: true })
    expect(ua.reasonCodes).not.toContain('russian_spelling_suspected')
    // but the single given-name token IS caught:
    const single = normalizeCanonicalValue('given_name', 'Андрей', { ukrainianDoc: true })
    expect(single.reasonCodes).toContain('russian_spelling_suspected')
  })
})
