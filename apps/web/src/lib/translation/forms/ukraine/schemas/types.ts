/**
 * Official Ukrainian form schema types. A schema mirrors the FACTUAL field
 * structure of an official state form (per its normative act) — it is the
 * single source of truth for what the bureau-style translation renders and in
 * what order. RULE: a schema must carry an `officialSource` (see
 * docs/official-forms/ukraine/source-ledger.json) or it must not exist.
 */

export type ExpectedScript = 'cyrillic' | 'latin' | 'numeric' | 'mixed'
export type TranslationRule =
  | 'transliterate_kmu55'   // names — transliteration, never translation
  | 'date_normalize'        // date → English, source preserved
  | 'glossary_authority'    // agency/authority via controlled glossary
  | 'locked_verbatim'       // numbers/series/act-record — kept exactly
  | 'translate_prose'       // free text → LLM prose (names/numbers locked)
  | 'place_gazetteer'       // place → snap to gazetteer + KMU-55

export type LayoutSection =
  | 'header' | 'issuingAuthority' | 'personFields' | 'actRecord'
  | 'signatures' | 'seals' | 'certification'

export interface FormFieldSpec {
  key: string
  sourceLabelUk: string
  sourceLabelEn: string
  required: boolean
  fieldGroup: string          // e.g. 'groom' | 'bride' | 'marriage' | 'issuing'
  expectedScript: ExpectedScript
  translationRule: TranslationRule
  lockedEntity: boolean       // true → never re-translated (name/number/date)
  evidenceRequired: boolean   // must trace to a visible region of the source
}

export interface OfficialFormSchema {
  docType: string
  titleEn: string
  officialSource: { act: string; url: string; authority: string; effectiveDate: string }
  fields: FormFieldSpec[]
  layoutSections: LayoutSection[]
}
