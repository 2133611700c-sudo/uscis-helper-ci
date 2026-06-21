/**
 * Marriage Certificate Extraction Prompt — Messenginfo v6.0
 *
 * Builds the DeepSeek Text prompt for extracting fields from a
 * Ukrainian marriage certificate (Свідоцтво про шлюб).
 *
 * Architecture:
 *   1. Google Vision OCR → tokens with IDs
 *   2. This prompt → DeepSeek Text maps token IDs to field values
 *   3. Backend resolves bbox from token IDs (DeepSeek never sees coordinates)
 *
 * CRITICAL RULES (enforced in prompt):
 *   Rule 1: certificate_number ≠ act_record_number (different labels, different zones)
 *   Rule 2: act_record_date ≠ date_of_marriage ≠ date_of_issue (each from its own label)
 *   Rule 3: spouse_1 from first spouse block, spouse_2 from second spouse block (no swapping)
 *   Rule 4: surname_before_marriage from ПРІЗВИЩЕ ДО label; surname_after from ПРІЗВИЩЕ ПІСЛЯ label
 *   Rule 5: No coordinate invention — return OCR token IDs only
 *   Rule 6: Missing field → missing/review_required, NOT a guessed value
 *   Rule 7: Ukrainian date is primary; Russian fallback requires review_required=true
 *   Rule 8: patronymic stays Patronymic, never "Middle Name"
 *   Rule 9: No silent ЗАГС→ДРАЦС modernization
 *   Rule 10: Genitive/dative name form → flag for nominative restoration, do not auto-normalize
 *   Rule 11: Mixed Latin/Cyrillic in a name → review_required=true
 *   Rule 12: Duplicate Ukrainian/Russian layers for same field → collapse; Russian fallback=review_required
 */

// ── Field output schema ──────────────────────────────────────────────────────

export interface MarriageCertExtractionField {
  /** Internal field key (e.g. 'spouse_1_given_name') */
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
  /** Source zone where value was found (e.g. 'spouse_1_block', 'act_record_block') */
  source_zone: string
}

// ── Canonical field targets ───────────────────────────────────────────────────

export const MARRIAGE_CERT_EXTRACTION_TARGETS: readonly string[] = [
  'document_type',
  'certificate_series',
  'certificate_number',
  'act_record_number',
  'act_record_date',
  'spouse_1_surname_before_marriage',
  'spouse_1_given_name',
  'spouse_1_patronymic',
  'spouse_1_surname_after_marriage',
  'spouse_2_surname_before_marriage',
  'spouse_2_given_name',
  'spouse_2_patronymic',
  'spouse_2_surname_after_marriage',
  'date_of_marriage',
  'issuing_authority',
  'date_of_issue',
  'place_of_marriage_registration',
  'citizenship_spouse_1',
  'citizenship_spouse_2',
  'readable_stamp_text',
  'repeated_certificate_marker',
  'document_language_layer',
  'archive_or_duplicate_note',
]

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the DeepSeek Text extraction prompt for a Ukrainian marriage certificate.
 *
 * @param ocrTokensJson  JSON string of OCR token array from Google Vision
 * @param glossaryJson   JSON string of civil_registry_terms glossary
 */
export function buildMarriageCertExtractionPrompt(
  ocrTokensJson: string,
  glossaryJson: string,
): string {
  return `You are a document field extractor for Ukrainian civil status documents.
You will extract structured field data from OCR tokens of a Ukrainian marriage certificate (Свідоцтво про шлюб).

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
${MARRIAGE_CERT_EXTRACTION_TARGETS.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## Mandatory Rules

### Rule 1 — certificate_number ≠ act_record_number
These are TWO DIFFERENT fields with DIFFERENT labels:
- certificate_number: next to "СВІДОЦТВО №", "СЕРІЯ", "№" at the top of the certificate face
- act_record_number: next to "АКТОВИЙ ЗАПИС №", "НОМЕР АКТОВОГО ЗАПИСУ" in the registry block
If the same value appears under both labels, return both fields with review_required=true and reason="possible_value_collision".

### Rule 2 — Date fields must come from their own labels
- act_record_date: from "ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ" or "ДАТА СКЛАДАННЯ ЗАПИСУ" label ONLY
- date_of_marriage: from "ДАТА РЕЄСТРАЦІЇ ШЛЮБУ" or "ШЛЮБ ЗАРЕЄСТРОВАНО" label ONLY
- date_of_issue: from "ДАТА ВИДАЧІ" label ONLY
Do NOT use one date for another field, even if they match numerically.

### Rule 3 — Spouse order must be preserved
- spouse_1 fields come from the FIRST spouse data block (top or left)
- spouse_2 fields come from the SECOND spouse data block (bottom or right)
If the block ordering is ambiguous, set review_required=true with reason="spouse_block_ordering_ambiguous".

### Rule 4 — Before/after surname labels must match
- spouse_N_surname_before_marriage: from "ПРІЗВИЩЕ ДО ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ" label
- spouse_N_surname_after_marriage: from "ПРІЗВИЩЕ ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ" or
  "ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ ПРИСВОЄНО ПРІЗВИЩЕ" label
If labels are absent or ambiguous, set review_required=true with reason="before_after_surname_label_unclear".

### Rule 5 — No coordinate invention
Return ocr_ids arrays only. Do NOT generate x/y/width/height values.
Leave bbox_status as "missing" if no tokens back the value.

### Rule 6 — Missing fields must be review_required
If a field is not found in the tokens, return:
{ "field": "<key>", "raw_value": "", "normalized_value": null, "ocr_ids": [], "evidence_type": "zone_fallback", "bbox_status": "missing", "confidence": 0, "review_required": true, "review_reason": "field_not_found_in_ocr", "source_zone": "unknown" }
Do NOT guess a value for a missing field.

### Rule 7 — Ukrainian dates are primary
Date format on Ukrainian documents: "DD місяць YYYY" (e.g. "14 березня 2005").
Normalize to: "DD Month YYYY" (e.g. "14 March 2005").
If month names are Russian (февраля, января, etc.), set review_required=true with reason="russian_month_fallback".
Partial or unreadable month → review_required=true with reason="partial_date_unreadable".

### Rule 8 — Patronymic stays Patronymic
Fields ending in _patronymic must NEVER be labeled or normalized as "Middle Name".
These fields contain the Ukrainian patronymic (по батькові).

### Rule 9 — No ЗАГС→ДРАЦС modernization
If the issuing_authority contains "ЗАГС" or "РАЦС", preserve it exactly.
Do NOT replace with "ДРАЦС" or any modern equivalent.
If both ЗАГС and ДРАЦС appear together, set review_required=true with reason="civil_registry_modernization_conflict".

### Rule 10 — Name case normalization
Ukrainian names often appear in genitive or dative case on marriage certificates.
If a name appears to be in an oblique case:
- set review_required=true with reason="oblique_case_detected"
- include candidate_nominative if you can restore it
- do NOT silently replace the extracted form

### Rule 11 — Mixed Latin/Cyrillic
If a name field contains both Latin and Cyrillic characters (e.g. OCR lookalikes),
set review_required=true with reason="mixed_script_detected".

### Rule 12 — Bilingual layer collapse
Ukrainian marriage certificates may have both Ukrainian and Russian text.
Ukrainian layer is primary. If a field value is extracted from Russian text,
set review_required=true with reason="russian_language_fallback".
Do NOT duplicate fields — return one value per field key.

## Output Format
Return a JSON array of field objects. No markdown, no explanation, no headers.
Only the JSON array.

Example (structure only, values are illustrative):
[
  {
    "field": "certificate_number",
    "raw_value": "123456",
    "normalized_value": "123456",
    "ocr_ids": ["w_003", "w_004"],
    "evidence_type": "ocr_bbox",
    "bbox_status": "combined",
    "confidence": 0.97,
    "review_required": false,
    "source_zone": "certificate_header_block"
  },
  {
    "field": "act_record_number",
    "raw_value": "789",
    "normalized_value": "789",
    "ocr_ids": ["w_042"],
    "evidence_type": "ocr_bbox",
    "bbox_status": "exact",
    "confidence": 0.95,
    "review_required": false,
    "source_zone": "act_record_block"
  }
]`
}
