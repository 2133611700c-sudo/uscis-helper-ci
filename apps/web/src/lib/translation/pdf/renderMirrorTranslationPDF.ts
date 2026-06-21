/**
 * renderMirrorTranslationPDF — the wiring that turns REAL extracted fields into a
 * faithful English MIRROR of the Ukrainian official document.
 *
 *   docType + extracted fields
 *     → getOfficialSchema(docType)            (registry: docType → normative schema)
 *     → buildMirrorValues(schema, extracted)  (map registry keys → schema keys)
 *     → renderOfficialTranslation(schema, …)  (draw the mirror PDF by schema layout)
 *
 * Returns null when no official schema exists for the docType (caller falls back
 * to the generic certification PDF). The mirror reproduces the document's
 * structure per its KMU source — header, person groups, act record, issuing
 * authority, seal/signature placeholders, translator certification — never a
 * spontaneous layout, and never an invented value (uncertain → [CONFIRM],
 * missing → [enter from document]).
 */
import { getOfficialSchema } from '../forms/ukraine/schemas/registry'
import { buildMirrorValues, collectMirrorExtras, type ExtractedFieldLite } from './buildMirrorValues'
import { renderOfficialTranslation } from './templates/ukraine/renderOfficialTranslation'

export interface MirrorPdfResult {
  pdf: Buffer
  unresolved: string[]
  docType: string
  schemaTitle: string
  officialSource: { act: string; url: string; authority: string; effectiveDate: string }
}

export async function renderMirrorTranslationPDF(
  docType: string | null | undefined,
  extracted: ExtractedFieldLite[],
  opts: { signerName?: string; signerAddress?: string; signedAt?: string } = {},
): Promise<MirrorPdfResult | null> {
  const schema = getOfficialSchema(docType)
  if (!schema) return null
  const values = buildMirrorValues(schema, extracted)
  const extras = collectMirrorExtras(schema, extracted)
  const { pdf, unresolved } = await renderOfficialTranslation(schema, values, { ...opts, extras })
  return {
    pdf,
    unresolved,
    docType: schema.docType,
    schemaTitle: schema.titleEn,
    officialSource: schema.officialSource,
  }
}
