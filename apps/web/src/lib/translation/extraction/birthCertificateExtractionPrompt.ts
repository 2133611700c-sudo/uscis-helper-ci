/**
 * Birth Certificate Extraction Prompt — Messenginfo v6.0
 *
 * This module provides the DeepSeek Text prompt and output schema for
 * extracting fields from a Ukrainian birth certificate.
 *
 * Architecture:
 *   Google Vision OCR → token IDs + raw text → DeepSeek Text (this prompt)
 *   → structured JSON output → backend bbox resolution from OCR IDs
 *
 * Rules:
 *   - DeepSeek receives OCR tokens with IDs; it returns ocr_ids for each field
 *   - Backend resolves bbox from those OCR IDs — DeepSeek never invents coordinates
 *   - If a field is not present, return missing + review_required=true
 *   - Ukrainian text is primary; Russian fallback requires review_required=true
 *   - certificate_number and act_record_number MUST come from different label zones
 *   - 'По батькові' / 'Patronymic' — NEVER labeled as 'middle_name'
 *   - Parent names may appear in genitive/dative case; flag nominative_restoration_needed
 *   - Do NOT invent missing values; return null + review_required for absent fields
 */

// ── Output schema type (per field) ───────────────────────────────────────────

export interface BirthCertExtractionField {
  /** Internal field key */
  field: string
  /** Raw value as extracted from OCR (Ukrainian/Russian as printed) */
  raw_value: string | null
  /** Normalized English value (month names translated, case restored if confident) */
  normalized_value: string | null
  /** OCR token IDs that contributed to this field value */
  ocr_ids: string[]
  /** Evidence type classification */
  evidence_type: 'ocr_bbox' | 'combined_ocr_bbox' | 'text_only' | 'missing'
  /** Bbox status — backend resolves from ocr_ids */
  bbox_status: 'resolved' | 'partial' | 'missing'
  /** Extraction confidence 0.0–1.0 */
  confidence: number
  /** Whether this field needs human review before PDF generation */
  review_required: boolean
  /** Reason for review_required if true */
  review_reason?: string
  /** Source zone label from document layout analysis */
  source_zone: string
  /** True if name appears to be in oblique case and nominative restoration was applied */
  nominative_restoration_needed?: boolean
  /** Suggested nominative form if name was in genitive/dative */
  nominative_candidate?: string
  /** True if value came from Russian text layer (Ukrainian is primary) */
  russian_fallback_used?: boolean
}

// ── 14 critical field targets ─────────────────────────────────────────────────

export const BIRTH_CERT_EXTRACTION_TARGETS: readonly string[] = [
  'document_type',
  'certificate_series',
  'certificate_number',
  'act_record_number',
  'act_record_date',
  'child_surname',
  'child_given_name',
  'child_patronymic',
  'date_of_birth',
  'place_of_birth',
  'father_full_name',
  'mother_full_name',
  'issuing_authority',
  'date_of_issue',
  // Optional:
  'citizenship',
  'sex',
  'registration_place',
  'repeated_certificate_marker',
  'readable_stamp_text',
  'document_language_layer',
  'archive_or_duplicate_note',
]

// ── DeepSeek prompt builder ───────────────────────────────────────────────────

/**
 * Build the DeepSeek Text extraction prompt for a Ukrainian birth certificate.
 *
 * @param ocrTokensJson  Serialized array of OCR tokens: [{id, text, confidence}]
 * @param glossaryJson   Serialized civil registry glossary for authority lookup
 */
export function buildBirthCertExtractionPrompt(
  ocrTokensJson: string,
  glossaryJson: string,
): string {
  return `You are a Ukrainian civil document field extractor for USCIS translation purposes.

You will receive OCR token data from a Ukrainian birth certificate (Свідоцтво про народження).
Each token has: id (string), text (Ukrainian/Russian as printed), confidence (0.0–1.0).

GLOSSARY of civil registry terms (use for issuing_authority resolution):
${glossaryJson}

OCR TOKENS:
${ocrTokensJson}

YOUR TASK:
Extract the following fields. Return a JSON array. One object per field.

CRITICAL RULES:
1. certificate_number is the series+number printed on the certificate face (e.g. І-КВ 123456).
   act_record_number is the civil registry act number (e.g. 789).
   These are DIFFERENT fields from DIFFERENT label zones. Never confuse them.
   If you cannot distinguish them with certainty, return both as review_required=true.

2. Return ocr_ids (array of token ID strings) for every value you extract.
   Do NOT invent coordinates or bounding boxes — the backend resolves those from ocr_ids.

3. If a field is not present in the OCR data: set raw_value=null, normalized_value=null,
   evidence_type="missing", bbox_status="missing", confidence=0, review_required=true,
   review_reason="field_not_found_in_ocr".

4. act_record_date must come from the act record label zone only.
   It must NOT be confused with date_of_birth or date_of_issue.

5. date_of_birth must come from the birth date label zone only.
   date_of_issue must come from the issue date label zone only.

6. child_patronymic: This field represents the Patronymic (По батькові).
   Never call it "middle_name" in any output.

7. father_full_name must come from the father label block.
   mother_full_name must come from the mother label block.
   If labels are unclear, set review_required=true, review_reason="parent_labels_unclear".

8. Names (child_surname, child_given_name, child_patronymic, father_full_name, mother_full_name)
   may appear in genitive or dative case on Ukrainian documents.
   If you detect an oblique case form, set nominative_restoration_needed=true and
   provide nominative_candidate with your best restoration.
   Never silently normalize — always flag with review_required=true if uncertain.

9. Mixed Latin/Cyrillic in names (OCR lookalike errors): set review_required=true,
   review_reason="mixed_script_detected".

10. Ukrainian text is primary. If you use Russian month names or Russian text as source,
    set russian_fallback_used=true and review_required=true.

11. If issuing_authority contains an abbreviation not in the glossary, set
    review_required=true, review_reason="civil_registry_abbreviation_not_verified".
    Do NOT silently modernize ЗАГС to ДРАЦС.

12. If the document says "ПОВТОРНО" (duplicate/re-issued), flag it in repeated_certificate_marker
    with review_required=true.

DATE NORMALIZATION:
- Normalize dates to format: "DD Month YYYY" (e.g. "25 June 1986")
- Ukrainian month names are primary (see genitive forms below)
- Russian month names are fallback — require russian_fallback_used=true
- If the date is spelled out in words, return raw_value as found, normalized_value=null,
  review_required=true, review_reason="date_spelled_out_not_parseable"

Ukrainian months (genitive): січня, лютого, березня, квітня, травня, червня,
  липня, серпня, вересня, жовтня, листопада, грудня
Russian months (genitive, fallback): января, февраля, марта, апреля, мая, июня,
  июля, августа, сентября, октября, ноября, декабря

FIELDS TO EXTRACT:
${BIRTH_CERT_EXTRACTION_TARGETS.map((t, i) => `${i + 1}. ${t}`).join('\n')}

OUTPUT FORMAT:
Return only a valid JSON array. No markdown. No explanation. No commentary.
Example structure for one field:
{
  "field": "certificate_number",
  "raw_value": "123456",
  "normalized_value": "123456",
  "ocr_ids": ["w_0015", "w_0016"],
  "evidence_type": "ocr_bbox",
  "bbox_status": "resolved",
  "confidence": 0.95,
  "review_required": false,
  "source_zone": "certificate_header_block"
}`
}
