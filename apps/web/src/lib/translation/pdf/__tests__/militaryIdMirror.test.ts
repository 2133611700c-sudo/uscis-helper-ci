/**
 * militaryIdMirror.test.ts — the military-ID mirror schema (closes the acknowledged
 * "no template without source" debt; source = the official booklet blank, verified
 * against a real booklet 2026-06-11). Synthetic values only.
 */
import { describe, it, expect } from 'vitest'
import { getOfficialSchema } from '../../forms/ukraine/schemas/registry'
import { renderMirrorTranslationPDF } from '../renderMirrorTranslationPDF'

describe('ua_military_id mirror schema', () => {
  it('is registered with an explicit official source', () => {
    const s = getOfficialSchema('ua_military_id')
    expect(s).not.toBeNull()
    expect(s!.titleEn).toBe('MILITARY ID')
    expect(s!.officialSource.authority).toContain('Ministry of Defence')
  })

  it('renders a valid mirror PDF from docintel-shaped fields (no aliases needed)', async () => {
    const res = await renderMirrorTranslationPDF('ua_military_id', [
      { field: 'family_name', value: 'Ivanenko', review_required: false },
      { field: 'given_name', value: 'Taras', review_required: false },
      { field: 'patronymic', value: 'Petrovych', review_required: true }, // review → [CONFIRM]
      { field: 'dob', value: '1990-01-01', review_required: false },
      { field: 'doc_number', value: 'TC 000111', review_required: false },
    ])
    expect(res).not.toBeNull()
    expect(res!.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(res!.unresolved).toContain('patronymic')        // review-flagged surfaces
    expect(res!.unresolved).toContain('issuing_authority') // missing surfaces
    expect(res!.unresolved).not.toContain('family_name')   // clean finalizes
  })
})
