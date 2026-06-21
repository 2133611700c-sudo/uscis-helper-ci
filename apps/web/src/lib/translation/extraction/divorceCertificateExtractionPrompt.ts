/**
 * Divorce Certificate Extraction Prompt — Messenginfo v6.0
 *
 * Builds the DeepSeek Text prompt for extracting fields from a
 * Ukrainian divorce certificate (Свідоцтво про розірвання шлюбу).
 *
 * Architecture:
 *   1. Google Vision OCR → tokens with IDs
 *   2. This prompt → DeepSeek Text maps token IDs to field values
 *   3. Backend resolves bbox from token IDs (DeepSeek never sees coordinates)
 *
 * CRITICAL RULES (enforced in prompt):
 *   Rule 1: certificate_number ≠ act_record_number (different labels, different zones)
 *   Rule 2: act_record_date ≠ date_of_divorce ≠ date_of_issue (each from its own label)
 *   Rule 3: spouse_1 from first spouse block, spouse_2 from second spouse block (no swapping)
 *   Rule 4: basis_of_divorce from ПІДСТАВА label ONLY — never inferred
 *   Rule 5: Court decision details only if explicitly on document — never invented
 *   Rule 6: Long/complex/legal-text basis → review_required=true, reason=complex_legal_basis
 *   Rule 7: No coordinate invention — return OCR token IDs only
 *   Rule 8: Missing field → missing/review_required, NOT a guessed value
 *   Rule 9: Ukrainian date is primary; Russian fallback requires review_required=true
 *   Rule 10: patronymic stays Patronymic, never "Middle Name"
 *   Rule 11: No silent ЗАГС→ДРАЦС modernization
 *   Rule 12: Genitive/dative name form → flag for nominative restoration, do not auto-normalize
 */

// ── Field output schema ──────────────────────────────────────────────────────

export interface DivorceCertExtractionField {
  /** Internal field key (e.g. 'spouse_1_surname') */
  field: string
  /** Raw text from OCR as-is (untranslated) */
  raw_value: string
  /** Normalized English value. Use null if not extractable. */
  normalized_value: string | null
  /** OCR token IDs that back this field. Empty array if no tokens found. */
  ocr_ids: string[]
  /** How the value was sourced */
  evidence_type: 'ocr_bbox' | 'combined_ocr_bbox' | 'zone_fallback' | 'manual'
  /** Bbox resolution status — backend fills this from ocr_ids */
  bbox_status: 'exact' | 'combined' | 'approximate' | 'missing'
  /** Confidence 0–1 */
  confidence: number
  /** True if value needs human review before PDF generation */
  review_required: boolean
  /** Reason for review_required, if applicable */
  review_reason?: string
  /** Source zone where value was found */
  source_zone: string
}

// ── Canonical field targets ───────────────────────────────────────────────────

export const DIVORCE_CERT_EXTRACTION_TARGETS: readonly string[] = [
  'document_type',
  'certificate_series',
  'certificate_number',
  'act_record_number',
  'act_record_date',
  'spouse_1_surname',
  'spouse_1_given_name',
  'spouse_1_patronymic',
  'spouse_2_surname',
  'spouse_2_given_name',
  'spouse_2_patronymic',
  'date_of_divorce',
  'basis_of_divorce',
  'issuing_authority',
  'date_of_issue',
  'court_decision_number',
  'court_decision_date',
  'court_name',
  'place_of_divorce_registration',
  'readable_stamp_text',
  'repeated_certificate_marker',
  'document_language_layer',
  'archive_or_duplicate_note',
]

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the DeepSeek Text extraction prompt for a Ukrainian divorce certificate.
 *
 * @param ocrTokensJson  JSON string of OCR token array from Google Vision
 * @param glossaryJson   JSON string of civil_registry_terms glossary
 */
export function buildDivorceCertExtractionPrompt(
  ocrTokensJson: string,
  glossaryJson: string,
): string {
  return `You are a document field extractor for Ukrainian civil status documents.
You will extract structured field data from OCR tokens of a Ukrainian divorce certificate (Свідоцтво про розірвання шлюбу).

## OCR Tokens
Each token has: id, text, page, confidence.
Return OCR token IDs — do NOT invent or calculate coordinates.

\`\`\`json
${ocrTokensJson}
\`\`\`

## Civil Registry Glossary
Use this glossary to recognize Ukrainian civil registry terms and agency names.
\`\`\`json
${glossaryJson}
\`\`\`

## Fields to Extract
Return one JSON object per field. Extract ALL of the following:
${DIVORCE_CERT_EXTRACTION_TARGETS.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## Mandatory Rules

### Rule 1 — certificate_number ≠ act_record_number
These are TWO DIFFERENT fields with DIFFERENT labels:
- certificate_number: next to "СВІДОЦТВО №", "СЕРІЯ", "№" at the top of the certificate face
- act_record_number: next to "АКТОВИЙ ЗАПИС №", "НОМЕР АКТОВОГО ЗАПИСУ" in the registry block
If the same value appears under both labels, return both with review_required=true and reason="possible_value_collision".

### Rule 2 — Date fields must come from their own labels
- act_record_date: from "ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ" or "ДАТА СКЛАДАННЯ ЗАПИСУ" label ONLY
- date_of_divorce: from "ДАТА РОЗІРВАННЯ ШЛЮБУ" or "ШЛЮБ РОЗІРВАНО" label ONLY
- date_of_issue: from "ДАТА ВИДАЧІ" label ONLY
Do NOT use one date for another field, even if they match numerically.

### Rule 3 — Spouse order must be preserved
- spouse_1 fields come from the FIRST spouse data block (top or left)
- spouse_2 fields come from the SECOND spouse data block (bottom or right)
If the block ordering is ambiguous, set review_required=true with reason="spouse_block_ordering_ambiguous".

### Rule 4 — basis_of_divorce from label ONLY
basis_of_divorce must be extracted ONLY from the "ПІДСТАВА РОЗІРВАННЯ ШЛЮБУ" or "ПІДСТАВА" label zone.
Do NOT infer the basis from surrounding text, court names, or other context.
If the label is present but value is empty, set review_required=true with reason="basis_not_found_in_label_zone".

### Rule 5 — Court decision details only if explicit
court_decision_number, court_decision_date, and court_name must ONLY be returned if
the corresponding labels ("РІШЕННЯ СУДУ №", "ДАТА РІШЕННЯ СУДУ", "СУД") are explicitly
present on the document.
Do NOT invent or infer court decision details from surrounding text.

### Rule 6 — Complex legal basis → review_required
If basis_of_divorce contains legal text that is:
- more than 30 words, OR
- includes court case numbers, article references, or procedural language
Set review_required=true with reason="complex_legal_basis".
Provide the raw_value but do NOT attempt to summarize or paraphrase.

### Rule 7 — No coordinate invention
Return ocr_ids arrays only. Do NOT generate x/y/width/height values.
Leave bbox_status as "missing" if no tokens back the value.

### Rule 8 — Missing fields must be review_required
If a field is not found in the tokens, return:
{ "field": "<key>", "raw_value": "", "normalized_value": null, "ocr_ids": [], "evidence_type": "zone_fallback", "bbox_status": "missing", "confidence": 0, "review_required": true, "review_reason": "field_not_found_in_ocr", "source_zone": "unknown" }
Do NOT guess a value for a missing field.

### Rule 9 — Ukrainian dates are primary
Date format on Ukrainian documents: "DD місяць YYYY" (e.g. "14 березня 2005").
Normalize to: "DD Month YYYY" (e.g. "14 March 2005").
If month names are Russian (февраля, января, etc.), set review_required=true with reason="russian_month_fallback".
Partial or unreadable month → review_required=true with reason="partial_date_unreadable".

### Rule 10 — Patronymic stays Patronymic
Fields ending in _patronymic must NEVER be labeled or normalized as "Middle Name".
These fields contain the Ukrainian patronymic (по батькові).

### Rule 11 — No ЗАГС→ДРАЦС modernization
If the issuing_authority contains "ЗАГС" or "РАЦС", preserve it exactly.
Do NOT replace with "ДРАЦС" or any modern equivalent.
If both ЗАГС and ДРАЦС appear together, set review_required=true with reason="civil_registry_modernization_conflict".

### Rule 12 — Name case normalization
Ukrainian names often appear in genitive or dative case on divorce certificates.
If a name appears to be in an oblique case:
- set review_required=true with reason="oblique_case_detected"
- include candidate_nominative if you can restore it
- do NOT silently replace the extracted form

## Output Format
Return a JSON array of field objects. No markdown, no explanation, no headers.
Only the JSON array.

Example (structure only, values are illustrative):
[
  {
    "field": "basis_of_divorce",
    "raw_value": "Рішення суду від 15 березня 2010 р.",
    "normalized_value": "Court Decision dated 15 March 2010",
    "ocr_ids": ["w_085", "w_086", "w_087", "w_088", "w_089"],
    "evidence_type": "combined_ocr_bbox",
    "bbox_status": "combined",
    "confidence": 0.91,
    "review_required": false,
    "source_zone": "basis_block"
  },
  {
    "field": "court_decision_number",
    "raw_value": "",
    "normalized_value": null,
    "ocr_ids": [],
    "evidence_type": "zone_fallback",
    "bbox_status": "missing",
    "confidence": 0,
    "review_required": true,
    "review_reason": "field_not_found_in_ocr",
    "source_zone": "unknown"
  }
]`
}
