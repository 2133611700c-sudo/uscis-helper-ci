/**
 * passportSchemaSnapshots.test.ts — Migration Plan step C (GT snapshot gate).
 *
 * Renders each of the 3 STAGED passport schemas through the REAL mirror
 * renderer (flag stubbed ON in-process) from synthetic extractions and pins:
 * valid PDF, review-flagged → unresolved (never silently printed), missing →
 * unresolved, clean critical fields → resolved.
 *
 * Owner-GT snapshot leg: if gitignored qa-private GT files exist locally they
 * are exercised too (values loaded from disk, NEVER hardcoded — PII rule);
 * absent in CI ⇒ that leg skips, the synthetic leg always runs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderMirrorTranslationPDF } from '../../../../pdf/renderMirrorTranslationPDF'
import type { ExtractedFieldLite } from '../../../../pdf/buildMirrorValues'

beforeAll(() => vi.stubEnv('PASSPORT_SCHEMA_RENDERER_ENABLED', '1'))
afterAll(() => vi.unstubAllEnvs())

const CASES: Array<{ docType: string; fields: ExtractedFieldLite[]; mustResolve: string[]; mustUnresolve: string[] }> = [
  {
    docType: 'ua_internal_passport_booklet',
    fields: [
      { field: 'family_name', value: 'Ivanenko', review_required: false },
      { field: 'given_name', value: 'Ivan', review_required: false },
      { field: 'patronymic', value: 'Petrovych', review_required: true }, // handwritten → review
      { field: 'dob', value: '1990-01-01', review_required: false },
      // city/province omitted → must surface as unresolved, never invented
    ],
    mustResolve: ['family_name', 'given_name', 'dob'],
    mustUnresolve: ['patronymic', 'city_of_birth'],
  },
  {
    docType: 'ua_international_passport',
    fields: [
      { field: 'family_name', value: 'IVANENKO', review_required: false },
      { field: 'given_name', value: 'IVAN', review_required: false },
      { field: 'passport_number', value: 'FA123456', review_required: false },
      { field: 'dob', value: '1990-01-01', review_required: false },
      { field: 'passport_expiration_date', value: '2030-01-01', review_required: false },
    ],
    mustResolve: ['family_name', 'passport_number', 'passport_expiration_date'],
    mustUnresolve: [],
  },
  {
    docType: 'ua_id_card',
    fields: [
      { field: 'family_name', value: 'Ivanenko', review_required: false },
      { field: 'given_name', value: 'Ivan', review_required: false },
      { field: 'doc_number', value: '000000001', review_required: true },
    ],
    mustResolve: ['family_name', 'given_name'],
    mustUnresolve: ['doc_number', 'dob'],
  },
]

describe('staged passport schemas — mirror render snapshots (synthetic)', () => {
  for (const c of CASES) {
    it(`${c.docType}: valid PDF, review/missing → unresolved, clean → resolved`, async () => {
      const res = await renderMirrorTranslationPDF(c.docType, c.fields)
      expect(res, 'schema must resolve with the flag ON').not.toBeNull()
      expect(res!.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(res!.pdf.length).toBeGreaterThan(1000)
      for (const f of c.mustUnresolve) expect(res!.unresolved, `unresolved ${f}`).toContain(f)
      for (const f of c.mustResolve) expect(res!.unresolved, `resolved ${f}`).not.toContain(f)
    })
  }

  it('renders even with the retired flag absent (passports registered unconditionally)', async () => {
    vi.stubEnv('PASSPORT_SCHEMA_RENDERER_ENABLED', '')
    try {
      const res = await renderMirrorTranslationPDF('ua_internal_passport_booklet', CASES[0].fields)
      expect(res).not.toBeNull()
      expect(res!.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    } finally {
      vi.stubEnv('PASSPORT_SCHEMA_RENDERER_ENABLED', '1')
    }
  })
})

// ── Owner-GT leg (local only; qa-private is gitignored → skips in CI) ────────
// GT files are FLAT key→value (real-doc format). Values come from disk only,
// never hardcoded here (PII rule). gtKey → schema field name mapping below.
const GT_DIR = path.join(__dirname, '../../../../../../../../../qa-private/ground-truth')
const GT_CASES: Array<{ docType: string; file: string; map: Record<string, string> }> = [
  {
    docType: 'ua_internal_passport_booklet',
    file: 'internal_passport_ivanenko.json',
    map: {
      family_name_latin: 'family_name', given_name_latin: 'given_name',
      patronymic_latin: 'patronymic', date_of_birth: 'dob',
      place_of_birth_english: 'city_of_birth', province: 'province_of_birth',
    },
  },
  {
    docType: 'ua_international_passport',
    file: 'passport_international_ivanenko.json',
    map: {
      family_name_latin: 'family_name', given_name_latin: 'given_name',
      passport_number: 'passport_number', date_of_birth: 'dob',
      expiry_date: 'passport_expiration_date',
    },
  },
]

describe('staged passport schemas — owner GT snapshots (local-only)', () => {
  for (const { docType, file, map } of GT_CASES) {
    const p = path.join(GT_DIR, file)
    it.skipIf(!existsSync(p))(`${docType}: renders from the owner GT values`, async (ctx) => {
      const gt = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
      const fields: ExtractedFieldLite[] = Object.entries(map)
        .filter(([gtKey]) => typeof gt[gtKey] === 'string' && (gt[gtKey] as string).length > 0)
        .map(([gtKey, schemaField]) => ({
          field: schemaField, value: gt[gtKey] as string, review_required: false,
        }))
      // GT template not yet filled by the owner (empty strings) → honest skip,
      // never a green fake. The synthetic leg above still gates the schema.
      if (fields.length < 3) return ctx.skip()
      const res = await renderMirrorTranslationPDF(docType, fields)
      expect(res).not.toBeNull()
      expect(res!.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      // No GT value may end up unresolved-by-omission for fields we provided.
      for (const f of fields) expect(res!.unresolved).not.toContain(f.field)
    })
  }
})
