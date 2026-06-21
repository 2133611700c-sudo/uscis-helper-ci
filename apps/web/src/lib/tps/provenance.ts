/**
 * provenance.ts — sidecar provenance tracking for TPS answers.
 *
 * Phase 1: types + adapter + audit row generator.
 * Does NOT change TPSAnswers or wizard state.
 * Travels alongside the flat answers as a parallel map.
 *
 * Architecture:
 *   OCR → TpsExtractedField[] (has provenance)
 *       ↓ wizard applies to flat TPSAnswers
 *   TPSAnswers (flat, no provenance)  +  ProvenanceMap (sidecar)
 *       ↓ buildI821Ops / buildI765Ops
 *   I821Op[] / I765Op[]  +  AuditRow[] (provenance attached per op)
 *       ↓ prefill
 *   PDF  →  readback verification
 */

// ── Source document types ────────────────────────────────────────────────────

export type SourceDocumentType =
  | 'passport'
  | 'booklet'
  | 'i94'
  | 'ead'
  | 'i797'
  | 'driver_license'
  | 'user_manual'

export type ExtractionMethod =
  | 'ocr_mrz'
  | 'ocr_rule_parser'
  | 'ocr_label_match'
  | 'ai_brain'
  | 'ai_brain_targeted'
  | 'user_manual'
  | 'system_default'

export type UserReviewStatus =
  | 'unreviewed'
  | 'reviewed'
  | 'corrected'
  | 'manual_entry'

export type ValueStatus =
  | 'auto_with_source'
  | 'user_manual'
  | 'system_default'
  | 'missing'

// ── Per-field provenance record ──────────────────────────────────────────────

export interface FieldProvenance {
  /** Which document this value came from */
  source_document_type: SourceDocumentType
  /** How it was extracted */
  extraction_method: ExtractionMethod
  /** OCR/AI confidence 0..1, null for user_manual */
  confidence: number | null
  /** Original field key from extraction (e.g. 'family_name' from TpsExtractedField) */
  source_field: string | null
  /** User review state */
  user_review_status: UserReviewStatus
  /** Final classification */
  value_status: ValueStatus
}

/** Sidecar provenance map — keyed by TPSAnswers field name */
export type ProvenanceMap = Record<string, FieldProvenance>

// ── PDF audit row (generated during buildOps) ────────────────────────────────

export interface PdfAuditRow {
  /** Canonical field name from TPSAnswers */
  canonical_field: string
  /** Which USCIS form */
  pdf_form: 'I-821' | 'I-765'
  /** Exact AcroForm field name in the PDF */
  pdf_field_name: string
  /** Op kind: text, checkbox, choice */
  op_kind: 'text' | 'checkbox' | 'choice'
  /** Source document provenance (from sidecar, or 'unknown' if missing) */
  source_document_type: SourceDocumentType | 'unknown'
  /** Extraction method (from sidecar, or 'unknown') */
  extraction_method: ExtractionMethod | 'unknown'
  /** Confidence (from sidecar) */
  confidence: number | null
  /** User review status */
  user_review_status: UserReviewStatus | 'unknown'
  /** Was the op applied to the PDF? */
  pdf_written: boolean
}

// ── Factory helpers ──────────────────────────────────────────────────────────

/** Create provenance for an OCR-extracted field */
export function ocrProvenance(
  source: SourceDocumentType,
  method: ExtractionMethod,
  confidence: number,
  sourceField: string,
  reviewed: boolean = false,
): FieldProvenance {
  return {
    source_document_type: source,
    extraction_method: method,
    confidence,
    source_field: sourceField,
    user_review_status: reviewed ? 'reviewed' : 'unreviewed',
    value_status: 'auto_with_source',
  }
}

/** Create provenance for a user-manually-entered field */
export function manualProvenance(corrected: boolean = false): FieldProvenance {
  return {
    source_document_type: 'user_manual',
    extraction_method: 'user_manual',
    confidence: null,
    source_field: null,
    user_review_status: corrected ? 'corrected' : 'manual_entry',
    value_status: 'user_manual',
  }
}

/** Create provenance for a system default (e.g. country_of_nationality = 'Ukraine') */
export function defaultProvenance(field: string): FieldProvenance {
  return {
    source_document_type: 'user_manual',
    extraction_method: 'system_default',
    confidence: null,
    source_field: field,
    user_review_status: 'unreviewed',
    value_status: 'system_default',
  }
}

// ── Audit row builder ────────────────────────────────────────────────────────

interface OpLike {
  field: string
  kind: 'text' | 'checkbox' | 'choice'
  value: string | boolean
}

/**
 * Comprehensive reverse mapping: PDF AcroForm field name → canonical TPSAnswers key.
 *
 * Built from i821FieldMap.ts and i765FieldMap.ts source code.
 * Each entry maps a substring of the PDF field name to the canonical answer key.
 * Order matters: more specific patterns first to avoid false matches.
 */
const PDF_FIELD_TO_CANONICAL: Array<[substring: string, canonical: string]> = [
  // ── I-821 Part 2 — Identity ───────────────────────────────────────────
  ['Part2_Item1_FamilyName', 'family_name'],
  ['Part2_Item1_GivenName', 'given_name'],
  ['Part2_Item1_MiddleName', 'middle_name'],
  ['Part2_Item4_StreetNumberName', 'us_address_street'],
  ['Part2_Item4_CityOrTown', 'us_address_city'],
  ['Part2_Item4_State', 'us_address_state'],
  ['Part2_Item4_ZipCode', 'us_address_zip'],
  ['Part2_Item4_AptSteFlrNumber', 'us_address_unit_number'],
  ['Part2_Item4_InCareofName', 'us_address_in_care_of'],
  ['Part2_Item5_YN', 'mailing_same_as_physical'],
  ['Part2_Item6_StreetNumberName', 'mailing_street'],
  ['Part2_Item6_CityOrTown', 'mailing_city'],
  ['Part2_Item6_State', 'mailing_state'],
  ['Part2_Item6_ZipCode', 'mailing_zip'],
  ['Part2_Item7_AlienNumber', 'a_number'],
  ['Part2_Item8_AcctIdentifier', 'uscis_online_account'],
  ['Part2_Item9_SocialSecurityNumber', 'ssn'],
  ['Part2_Item10_DateOfBirth', 'dob'],
  ['Part2_Item11_DateOfBirth', 'dob'],
  ['Part2_Item12_Sex', 'sex'],
  ['Part2_Item13_CityOrTown', 'city_of_birth'],
  ['Part2_Item14_CountryofBirth', 'country_of_birth'],
  ['Part2_Item17_MaritalStatus', 'marital_status'],
  ['Part2_Item19_ImmigrationStatus', 'status_at_last_entry'],
  ['Part2_Item20_CityOrTown', 'port_of_entry_city'],
  ['Part2_Item20_State', 'port_of_entry_state'],
  ['Part2_Item21_AuthorizedPdofStay', 'authorized_stay'],
  ['Part2_Item22_Passport', 'passport_number'],
  ['Part2_Item22_I94', 'i94_admission_number'],
  ['Part2_Item24_CountryofIssuance', 'passport_country_of_issuance'],
  ['Part2_Item24_PassportExpiration', 'passport_expiration_date'],
  ['Part2_Item18_DateLastEntry', 'last_entry_date'],
  // ── I-821 Part 1 ──────────────────────────────────────────────────────
  ['Part1_Item1_ApplicationType', 'filing_path'],
  ['Part1_TPScountry', 'country_of_nationality'],
  ['Part1_Item3_EADApp', 'wants_ead'],
  // ── I-821 Part 3 — Biographic ─────────────────────────────────────────
  ['Part3_Item1_Ethnicity', 'ethnicity'],
  ['Part3_Item2_Race', 'race'],
  ['Part3_Item3_Height', 'height'],
  ['Part3_Item4_Weight', 'weight'],
  ['Part3_Item5_EyeColor', 'eye_color'],
  ['Part3_Item6_HairColor', 'hair_color'],
  // ── I-821 Part 7 — Background questions ───────────────────────────────
  ['Part7_Item', 'part7_background'],
  // ── I-821 Part 8 — Contact ────────────────────────────────────────────
  ['Part8_Item1_Phone', 'daytime_phone'],
  ['Part8_Item2_Phone', 'mobile_phone'],
  ['Part8_Item3_Email', 'email'],
  // ── I-765 — Lines ─────────────────────────────────────────────────────
  ['Line1a_FamilyName', 'family_name'],
  ['Line1b_GivenName', 'given_name'],
  ['Line1c_MiddleName', 'middle_name'],
  ['Line4b_StreetNumberName', 'us_address_street'],
  ['Pt2Line5_CityOrTown', 'us_address_city'],
  ['Pt2Line5_State', 'us_address_state'],
  ['Pt2Line5_ZipCode', 'us_address_zip'],
  ['Pt2Line5_AptSteFlrNumber', 'us_address_unit_number'],
  ['Part2Line5_Checkbox', 'mailing_same_as_physical'],
  ['Pt2Line7_StreetNumberName', 'us_address_street'],
  ['Pt2Line7_CityOrTown', 'us_address_city'],
  ['Pt2Line7_State', 'us_address_state'],
  ['Pt2Line7_ZipCode', 'us_address_zip'],
  ['Line7_AlienNumber', 'a_number'],
  ['Line9_Checkbox', 'sex'],
  ['Line10_Checkbox', 'race'],
  ['Line12b_SSN', 'ssn'],
  ['Line18a_CityTownOfBirth', 'city_of_birth'],
  ['Line18c_CountryOfBirth', 'country_of_birth'],
  ['Line19_DOB', 'dob'],
  ['Line20a_I94Number', 'i94_admission_number'],
  ['Line20b_Passport', 'passport_number'],
  ['Line20d_CountryOfIssuance', 'passport_country_of_issuance'],
  ['Line20e_ExpDate', 'passport_expiration_date'],
  ['Line21_DateOfLastEntry', 'last_entry_date'],
  ['Line23_StatusLastEntry', 'status_at_last_entry'],
  ['Line24_CurrentStatus', 'current_immigration_status'],
  ['Part1_Checkbox', 'filing_path'],
  // ── I-765 category code ───────────────────────────────────────────────
  ['section_1', 'ead_category'],
]

function canonicalKeyFromPdfField(pdfField: string): string {
  for (const [substring, canonical] of PDF_FIELD_TO_CANONICAL) {
    if (pdfField.includes(substring)) return canonical
  }
  // Fallback: extract last segment for unmapped fields
  const last = pdfField.split('.').pop() ?? pdfField
  return last.replace(/\[\d+\]$/g, '')
}

/**
 * Generate audit rows for a set of PDF ops with optional provenance sidecar.
 * If provenance is not available for a field, source is marked 'unknown'.
 */
export function buildAuditRows(
  ops: OpLike[],
  form: 'I-821' | 'I-765',
  provenance: ProvenanceMap | null,
  appliedFields: Set<string>,
): PdfAuditRow[] {
  return ops.map((op) => {
    const canonical = canonicalKeyFromPdfField(op.field)
    const prov = provenance?.[canonical] ?? null
    return {
      canonical_field: canonical,
      pdf_form: form,
      pdf_field_name: op.field,
      op_kind: op.kind,
      source_document_type: prov?.source_document_type ?? 'unknown',
      extraction_method: prov?.extraction_method ?? 'unknown',
      confidence: prov?.confidence ?? null,
      user_review_status: prov?.user_review_status ?? 'unknown',
      pdf_written: appliedFields.has(op.field),
    }
  })
}

// ── Provenance summary (no PII) ──────────────────────────────────────────────

export interface ProvenanceSummary {
  total_fields: number
  auto_with_source: number
  user_manual: number
  system_default: number
  unknown_provenance: number
  source_breakdown: Record<string, number>
  method_breakdown: Record<string, number>
}

export function summarizeProvenance(rows: PdfAuditRow[]): ProvenanceSummary {
  const summary: ProvenanceSummary = {
    total_fields: rows.length,
    auto_with_source: 0,
    user_manual: 0,
    system_default: 0,
    unknown_provenance: 0,
    source_breakdown: {},
    method_breakdown: {},
  }
  for (const r of rows) {
    const src = r.source_document_type
    summary.source_breakdown[src] = (summary.source_breakdown[src] ?? 0) + 1
    const meth = r.extraction_method
    summary.method_breakdown[meth] = (summary.method_breakdown[meth] ?? 0) + 1
    if (src === 'unknown') summary.unknown_provenance++
    else if (src === 'user_manual') summary.user_manual++
    else summary.auto_with_source++
  }
  return summary
}

// ── Phase 2: Wizard → ProvenanceMap converter ────────────────────────────────

/**
 * Generic input shape matching the wizard's FieldExtraction.
 * Avoids importing from UI component — dependency flows lib → UI, not reverse.
 */
export interface ProvenanceInput {
  value: string
  /** ExtractionSource from wizard: ocr_mrz | ocr_visual | ocr_keyword | ai_brain | user_input | user_corrected | inferred */
  source: string
  /** Upload slot: passport | i94 | ead | i797 | dl */
  doc_slot: string
  confidence: number | null
  source_field?: string | null
}

/** Map wizard ExtractionSource → provenance ExtractionMethod */
function toExtractionMethod(source: string): ExtractionMethod {
  switch (source) {
    case 'ocr_mrz': return 'ocr_mrz'
    case 'ocr_visual': return 'ocr_label_match'
    case 'ocr_keyword': return 'ocr_rule_parser'
    case 'ai_brain': return 'ai_brain'
    case 'user_input':
    case 'user_corrected': return 'user_manual'
    case 'inferred': return 'system_default'
    default: return 'ocr_rule_parser'
  }
}

/** Map wizard doc_slot → provenance SourceDocumentType */
function toSourceDocType(docSlot: string): SourceDocumentType {
  switch (docSlot) {
    case 'passport': return 'passport'
    case 'booklet': return 'booklet'
    case 'i94': return 'i94'
    case 'ead': return 'ead'
    case 'i797': return 'i797'
    case 'dl':
    case 'driver_license': return 'driver_license'
    default: return 'user_manual'
  }
}

/**
 * Known system defaults for TPS-Ukraine filing.
 * ONLY workflow/filing choices — NOT biographic/citizenship fields.
 * country_of_birth/nationality/issuance REQUIRE document evidence or user review.
 */
const SYSTEM_DEFAULT_FIELDS: Record<string, string> = {
  mailing_same_as_physical: 'true',
}

/**
 * Build a ProvenanceMap from the wizard's merged field state.
 *
 * Rules:
 * 1. If mergedFields[key] exists AND manualOverrides didn't change the value
 *    → ocrProvenance from the extraction source
 * 2. If manualOverrides[key] exists AND mergedFields[key] exists with a different value
 *    → manualProvenance(true) — user corrected an OCR result
 * 3. If manualOverrides[key] exists AND mergedFields[key] does NOT exist
 *    → manualProvenance(false) — user entered from scratch
 * 4. If the value matches a known system default AND no OCR/manual source
 *    → defaultProvenance()
 * 5. Driver license fields CANNOT provide immigration provenance
 *    (slot firewall: DL only supports address/identity cross-check)
 */
export function buildProvenanceFromWizard(
  mergedFields: Record<string, ProvenanceInput>,
  manualOverrides: Record<string, string>,
  finalAnswerKeys: string[],
): ProvenanceMap {
  const map: ProvenanceMap = {}

  /** Fields that DL is forbidden from providing as immigration source */
  const DL_FORBIDDEN_IMMIGRATION_FIELDS = new Set([
    'a_number', 'i94_admission_number', 'last_entry_date', 'status_at_last_entry',
    'passport_number', 'passport_expiration_date', 'passport_country_of_issuance',
    'country_of_birth', 'country_of_nationality',
  ])

  for (const key of finalAnswerKeys) {
    const mf = mergedFields[key]
    const manual = manualOverrides[key]
    const hasManual = manual !== undefined && manual !== null && manual.toString().trim() !== ''

    if (mf && mf.value) {
      // DL firewall: if the field came from DL and it's an immigration field, reject provenance
      if (toSourceDocType(mf.doc_slot) === 'driver_license' && DL_FORBIDDEN_IMMIGRATION_FIELDS.has(key)) {
        // Treat as if the field was manually entered — DL cannot be the source
        map[key] = hasManual ? manualProvenance(false) : defaultProvenance(key)
        continue
      }

      if (hasManual && manual.trim() !== mf.value.trim()) {
        // User corrected the OCR value
        map[key] = manualProvenance(true)
      } else {
        // OCR value accepted (with or without review)
        map[key] = ocrProvenance(
          toSourceDocType(mf.doc_slot),
          toExtractionMethod(mf.source),
          mf.confidence ?? 0,
          mf.source_field ?? key,
        )
      }
    } else if (hasManual) {
      // No OCR, user typed from scratch
      map[key] = manualProvenance(false)
    } else if (key in SYSTEM_DEFAULT_FIELDS) {
      // Known system default
      map[key] = defaultProvenance(key)
    }
    // If none of the above, field is missing — no provenance entry
  }

  return map
}
