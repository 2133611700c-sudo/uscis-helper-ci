/**
 * Document Slot Contract — TPS OCR firewall.
 *
 * Single source of truth answering: "Given a user-selected document slot,
 * which TpsExtractedField keys are allowed to flow through to Step 5
 * review and downstream PDF prefill, and which must be hard-rejected?"
 *
 * Purpose:
 *   - Stop the AI Brain from filling fields the document can't possibly
 *     contain (e.g. surfacing an A-number from a passport).
 *   - Catch wrong-document-in-wrong-slot mistakes (user dropped a
 *     passport into the I-94 input by accident).
 *   - Keep identity authoritative: passport fields win over EAD/I-94
 *     name/DOB when they conflict, so we never silently override.
 *
 * The contract is intentionally STRICT. Adding a new allowed field is a
 * deliberate change that should be discussed in a PR.
 */
import type { TpsDocType } from '@/lib/tps/types'

/**
 * Wizard slot id (matches the keys used in TPSWizardV2.tsx uploads map).
 * Two slot ids may map to the same document family (e.g. ead and ead_old).
 */
export type SlotId =
  | 'passport'
  | 'booklet'
  | 'i94'
  | 'ead'
  | 'ead_old'
  | 'tps_notice'
  | 'i797'  // alias for tps_notice — used as docTypeHint in OCR route
  | 'i797_or_ead' // init-path combined slot: user uploads I-797 OR EAD
  | 'photo'
  | 'dl' // U.S. driver's license / state ID — used by re-parole wizard
  | 'military_id' // Ukrainian military ID booklet (Військовий квиток)
  | 'birth_certificate' // Ukrainian birth certificate (Свідоцтво про народження)

export interface DocumentSlotContract {
  /** Wizard slot id this contract applies to. */
  slot: SlotId
  /**
   * Backend `TpsDocType` values that, when returned by Brain or by the
   * rule module, are considered a correct match for this slot.
   */
  allowed_document_types: TpsDocType[]
  /**
   * Fields the slot may legitimately carry. Anything outside this list
   * is rejected with `FIELD_NOT_ALLOWED_FOR_DOCUMENT_SLOT`.
   */
  allowed_fields: string[]
  /**
   * Fields the slot must NEVER carry. A passport, for example, cannot
   * produce an A-number — that data only exists on EAD/I-797/manual.
   * Listed explicitly (vs implied complement of allowed_fields) so
   * audit reviewers can grep the forbidden set per slot.
   */
  forbidden_fields: string[]
}

/**
 * Per-slot contract registry. Adding a slot or a field here is the
 * full diff you need to enable it across the pipeline.
 */
export const DOCUMENT_CONTRACTS: Record<SlotId, DocumentSlotContract> = {
  passport: {
    slot: 'passport',
    allowed_document_types: ['passport'],
    allowed_fields: [
      'family_name',
      'given_name',
      'middle_name',
      'dob',
      'sex',
      'country_of_birth',
      'country_of_nationality',
      'passport_number',
      'passport_country_of_issuance',
      'passport_expiration_date',
      // BUG-10 FIX (2026-05-24): загранпаспорт visible zone has
      // "Місце народження / Place of birth: ВІННИЦЬКА ОБЛ./UKR"
      // Brain can extract province_of_birth from this printed text.
      // Much more reliable than booklet handwritten OCR.
      'province_of_birth',
      // P2 FIX: city_of_birth also extractable from passport visible zone.
      // Was rejected as FIELD_NOT_ALLOWED → Brain extraction killed.
      'city_of_birth',
    ],
    forbidden_fields: [
      'a_number',
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
      'status_at_last_entry',
      'ead_category_on_card',
      'ead_expiration_date',
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  // Ukrainian internal passport-booklet (паспорт-книжка).
  // When загранпаспорт IS uploaded, Field Arbiter gives MRZ priority for
  // identity fields (family_name, given_name, dob). Booklet values remain
  // as fallback.
  // Booklet-ONLY users (no загранпаспорт): booklet is the sole source for
  // all identity fields — Brain extraction + DOB fallback scan cover most.
  // Inferred constants (country_of_nationality, country_of_birth,
  // passport_country_of_issuance) are hardcoded "Ukraine" by the module.
  booklet: {
    slot: 'booklet',
    allowed_document_types: ['passport'],
    allowed_fields: [
      // Wave1 guarded extraction: birthplace + patronymic from booklet.
      // Patronymic (По батькові) is NOT available from any other source —
      // загранпаспорт MRZ doesn't carry it. Booklet is the ONLY automated source.
      'city_of_birth',
      'province_of_birth',
      // patronymic = the source-doc field («По батькові»); middle_name kept as a
      // backward-compat alias (legacy module / older reads still emit middle_name).
      'patronymic',
      'middle_name',
      // Wave2: dual-OCR cross-reference can reconstruct surname from
      // two OCR readings. Field Arbiter still gives MRZ priority.
      'family_name',
      // Booklet-only users (no загранпаспорт uploaded) need given_name from
      // somewhere — Brain extraction from OCR context is the primary source.
      // When загранпаспорт IS present, Field Arbiter gives MRZ priority anyway.
      'given_name',
      // 2026-05-26: explicit Ukrainian DOB parser normalizes
      // "01 січня 1990 року" => "1990-01-01" before merge.
      // Keep under review flow; invalid dates still reject.
      'dob',
      // Inferred constants — every Ukrainian internal passport is Ukraine-issued.
      // Module emits hardcoded 'Ukraine' (not from OCR), so always reliable.
      // Field Arbiter still gives загранпаспорт MRZ priority when present.
      'country_of_nationality',
      'country_of_birth',
      'passport_country_of_issuance',
      // Sex: single Cyrillic char (Ч/Ж) — simpler than names; normalization
      // maps to M/F. Booklet-only users have no other source for this field.
      'sex',
    ],
    forbidden_fields: [
      // 'middle_name' — MOVED TO ALLOWED (only source for patronymic)
      'passport_number',
      'passport_expiration_date',
      // Translation-only fields — not USCIS form fields; flow via translationExtractor
      // (picked up from CB rejected[] for translation path per ADR-008)
      'issued_by',
      'passport_date_of_issue',
      // Immigration fields — not in booklet
      'a_number',
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
      'status_at_last_entry',
      'ead_category_on_card',
      'ead_expiration_date',
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  i94: {
    slot: 'i94',
    allowed_document_types: ['i94'],
    allowed_fields: [
      'i94_admission_number',
      'last_entry_date',
      // i94_admit_until: critical for TPS — tells the wizard when current
      // parole/status period ends, used to decide if user is in valid
      // status window for TPS application. Without this, the I-94
      // upload is half-useless. Added 2026-05-20 after real-doc audit.
      'i94_admit_until',
      'i94_class_of_admission',
      'status_at_last_entry',
      // Port/place of last entry — I-94 carries this as "Port of Entry".
      // BUG-4b FIX (2026-05-24): was missing → I-94 OCR couldn't deliver
      // place_of_last_entry to the wizard.
      'place_of_last_entry',
      // I-94 also carries country of citizenship — allowed read-only;
      // identity guard makes passport authoritative on conflict.
      'country_of_nationality',
      // P2 FIX: I-94 module emits 'country_of_citizenship' (CBP field name)
      // which was rejected because only 'country_of_nationality' was listed.
      'country_of_citizenship',
      // I-94 mirrors a few passport-identity fields; allowed read-only,
      // but the identity conflict guard treats passport as authoritative.
      'passport_number',
      'passport_country_of_issuance',
      'family_name',
      'given_name',
      'dob',
    ],
    forbidden_fields: [
      'a_number',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_expiration_date',
    ],
  },
  ead: {
    slot: 'ead',
    allowed_document_types: ['ead'],
    allowed_fields: [
      'a_number',
      'ead_category_on_card',
      'ead_expiration_date',
      // EAD prints "Country of Birth" — allowed read-only; identity guard
      // makes passport authoritative on conflict. Added 2026-05-20.
      'country_of_birth',
      // EAD cards print name and DOB; allowed but identity guard makes
      // passport authoritative on conflict.
      'family_name',
      'given_name',
      'dob',
      'sex',
    ],
    forbidden_fields: [
      'passport_expiration_date',
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
    ],
  },
  // The "ead_old" slot is the previous EAD on a Re-Registration flow.
  // Same contract as ead — just a different upload slot.
  ead_old: {
    slot: 'ead_old',
    allowed_document_types: ['ead'],
    allowed_fields: [
      'a_number',
      'ead_category_on_card',
      'ead_expiration_date',
      'country_of_birth',
      'family_name',
      'given_name',
      'dob',
      'sex',
    ],
    forbidden_fields: [
      'passport_expiration_date',
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
    ],
  },
  // TPS Approval / Receipt Notice (Form I-797). Carries A-number and
  // mailing address; we allow conservative name fields for cross-check
  // but always treat passport as identity-authoritative.
  tps_notice: {
    slot: 'tps_notice',
    allowed_document_types: ['i797'],
    allowed_fields: [
      'a_number',
      'family_name',
      'given_name',
      'dob',
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
    forbidden_fields: [
      'i94_admission_number',
      'i94_class_of_admission',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_expiration_date',
    ],
  },
  // I-797 alias — same family as tps_notice but used directly as docTypeHint
  // in the OCR route. Adds I-797-specific fields (receipt_number, dates, etc.)
  i797: {
    slot: 'i797',
    allowed_document_types: ['i797'],
    allowed_fields: [
      'a_number',
      'receipt_number',
      'notice_date',
      'received_date',
      'notice_type',
      'form_type',
      'family_name',
      'given_name',
      'dob',
      'country_of_citizenship',
    ],
    forbidden_fields: [
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
      'status_at_last_entry',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_number',
      'passport_expiration_date',
      'passport_country_of_issuance',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  // U.S. driver's license / state ID — used by the re-parole wizard to
  // pull mailing address + biometric demographics (height/weight/eye/hair)
  // that USCIS I-131 Part 3 asks for. Identity name fields are still
  // owned by the passport slot via the conflict guard, so a typo on a
  // DL never overrides the passport.
  dl: {
    slot: 'dl',
    allowed_document_types: [],
    allowed_fields: [
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
      'family_name',
      'given_name',
      'dob',
      'sex',
      'height',
      'weight',
      'eye_color',
      'hair_color',
      // 2026-05-20 round 2: DL number itself (state license ID).
      // Cross-reference only — never an authoritative USCIS form field.
      'dl_number',
    ],
    forbidden_fields: [
      'a_number',
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_number',
      'passport_expiration_date',
    ],
  },
  // Combined I-797 / EAD slot (init path). User may upload either an
  // I-797 notice (receipt/approval) OR an EAD card into this slot.
  // P0 FIX (2026-05-24): this slot had NO contract entry → applyContract
  // returned UNKNOWN_SLOT and killed ALL fields from Brain and rule modules.
  // Allowed fields = union of i797 and ead contracts (minus address — only
  // tps_notice carries USCIS mailing address, not generic I-797/EAD).
  i797_or_ead: {
    slot: 'i797_or_ead',
    allowed_document_types: ['i797', 'ead'],
    allowed_fields: [
      // From I-797
      'a_number',
      'receipt_number',
      'notice_date',
      'received_date',
      'notice_type',
      'form_type',
      'uscis_online_account',
      // From EAD
      'ead_category_on_card',
      'ead_expiration_date',
      'country_of_birth',
      // Identity (both may carry)
      'family_name',
      'given_name',
      'dob',
      'sex',
    ],
    forbidden_fields: [
      'i94_admission_number',
      'i94_class_of_admission',
      'last_entry_date',
      'status_at_last_entry',
      'passport_number',
      'passport_expiration_date',
      'passport_country_of_issuance',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  // Ukrainian military ID booklet (Військовий квиток).
  // Hard-case document class: review_required=true on all fields always.
  // Does NOT allow immigration fields (I-94, A-number, EAD) — military ID
  // is an identity-only document.
  military_id: {
    slot: 'military_id',
    allowed_document_types: ['unknown'],
    allowed_fields: [
      'family_name',
      'given_name',
      'middle_name',       // patronymic
      'dob',
      'military_id_number',
      'military_id_series',
      'issuing_authority',
      'issuing_authority_english',
      'military_id_source_page',
      'city_of_birth',
      'country_of_nationality', // always Ukraine
    ],
    forbidden_fields: [
      // Immigration fields — military ID cannot produce these
      'a_number',
      'i94_admission_number',
      'i94_class_of_admission',
      'i94_admit_until',
      'last_entry_date',
      'status_at_last_entry',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_number',
      'passport_expiration_date',
      'passport_country_of_issuance',
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  // Ukrainian birth certificate (Свідоцтво про народження).
  // Hard-case document class: review_required=true ALWAYS.
  // Role-grounded: child_* fields never populated with parent names.
  // wrong_person_risk flag set when structure ambiguous.
  birth_certificate: {
    slot: 'birth_certificate',
    allowed_document_types: ['unknown'],
    allowed_fields: [
      // Child block — role-grounded (child prefix required)
      'child_family_name',
      'child_given_name',
      'child_patronymic',
      'dob',               // child date of birth
      'city_of_birth',     // child place of birth
      // Parent block — role-grounded (parent namespace)
      'father_full_name',
      'mother_full_name',
      // Registration block
      'act_record_number',
      'date_of_issue',
      'issuing_authority',
      'issuing_authority_english',
      'certificate_series_number',
    ],
    forbidden_fields: [
      // These must NEVER appear on a birth certificate extraction
      // (would mean parent name contaminated child block)
      'family_name',       // must be child_family_name
      'given_name',        // must be child_given_name
      // Immigration fields — birth cert cannot produce these
      'a_number',
      'i94_admission_number',
      'i94_class_of_admission',
      'i94_admit_until',
      'last_entry_date',
      'status_at_last_entry',
      'ead_category_on_card',
      'ead_expiration_date',
      'passport_number',
      'passport_expiration_date',
      'passport_country_of_issuance',
      'address',
      'us_address_street',
      'us_address_city',
      'us_address_state',
      'us_address_zip',
    ],
  },
  // Photo slot is just a 2x2 image carrier — no OCR fields expected.
  photo: {
    slot: 'photo',
    allowed_document_types: [],
    allowed_fields: [],
    forbidden_fields: [
      'family_name',
      'given_name',
      'middle_name',
      'dob',
      'sex',
      'passport_number',
      'passport_expiration_date',
      'a_number',
      'i94_admission_number',
      'ead_category_on_card',
      'ead_expiration_date',
      'country_of_nationality',
      'address',
    ],
  },
}

/**
 * Reason codes a contract violation can produce. Surfaced in the OCR
 * response and in wizard UI so auditors can grep without parsing prose.
 */
export type ContractViolationCode =
  | 'FIELD_NOT_ALLOWED_FOR_DOCUMENT_SLOT'
  | 'FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT'
  | 'DOCUMENT_TYPE_MISMATCH_FOR_SLOT'
  | 'UNKNOWN_SLOT'

export interface ContractCheckResult {
  /** The slot id that was applied. Null if slot wasn't recognized. */
  slot: SlotId | null
  /**
   * True when Brain's document_type does not match what the slot expects
   * (e.g. user dropped a passport into the I-94 input).
   */
  slot_mismatch: boolean
  /** Brain's document type, echoed for UI display. */
  detected_document_type: TpsDocType | 'unknown' | null
  /**
   * Field keys that survived the filter and may be merged into the
   * wizard's review state.
   */
  accepted_field_keys: string[]
  /**
   * Per-rejected-field reason. The shape mirrors brain.validated_skipped
   * so the response stays auditable from one place.
   */
  rejected_fields: Array<{ field: string; reason: ContractViolationCode }>
}

/**
 * Brain's schema uses long names like "international_passport"; the
 * server-side TpsDocType uses short names like "passport". Normalize so
 * the contract can be applied with either source's nomenclature.
 */
const DOC_TYPE_ALIASES: Record<string, TpsDocType | 'unknown'> = {
  passport: 'passport',
  international_passport: 'passport',
  ukrainian_internal_passport: 'passport',
  i94: 'i94',
  ead: 'ead',
  i797: 'i797',
  uscis_notice: 'i797',
  residence_evidence: 'residence_evidence',
  translated_document: 'translated_document',
  unknown: 'unknown',
}

/**
 * Apply the slot contract to a set of extracted fields.
 *
 * @param slotIdRaw   user-selected slot id (the wizard's docHint)
 * @param fieldKeys   list of field keys produced by rule modules + Brain
 * @param detectedDocType  Brain's `document_type` classification, or null.
 *   Accepts both backend-side TpsDocType names ("passport", "i94") and
 *   Brain-side long names ("international_passport", "uscis_notice").
 *
 * @returns auditable summary; does not mutate inputs.
 */
export function applyContract(
  slotIdRaw: string | null | undefined,
  fieldKeys: string[],
  detectedDocType: string | null,
): ContractCheckResult {
  const normalizedDocType = detectedDocType
    ? (DOC_TYPE_ALIASES[detectedDocType] ?? 'unknown')
    : null
  const slotId = (slotIdRaw || '').trim() as SlotId
  const contract = DOCUMENT_CONTRACTS[slotId]
  if (!contract) {
    return {
      slot: null,
      slot_mismatch: false,
      detected_document_type: normalizedDocType,
      accepted_field_keys: [],
      rejected_fields: fieldKeys.map((k) => ({
        field: k,
        reason: 'UNKNOWN_SLOT',
      })),
    }
  }
  const allowed = new Set(contract.allowed_fields)
  const forbidden = new Set(contract.forbidden_fields)
  const accepted: string[] = []
  const rejected: ContractCheckResult['rejected_fields'] = []
  for (const key of fieldKeys) {
    if (forbidden.has(key)) {
      rejected.push({ field: key, reason: 'FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT' })
    } else if (!allowed.has(key)) {
      rejected.push({ field: key, reason: 'FIELD_NOT_ALLOWED_FOR_DOCUMENT_SLOT' })
    } else {
      accepted.push(key)
    }
  }
  // Document-type mismatch: Brain says "ead" but slot expected "passport".
  // 'unknown' is NOT a hard mismatch — Brain may simply not be confident
  // enough to classify; field-level filter still applies as the safety net.
  let slotMismatch = false
  if (
    normalizedDocType &&
    normalizedDocType !== 'unknown' &&
    contract.allowed_document_types.length > 0 &&
    !contract.allowed_document_types.includes(normalizedDocType as TpsDocType)
  ) {
    slotMismatch = true
  }
  return {
    slot: slotId,
    slot_mismatch: slotMismatch,
    detected_document_type: normalizedDocType,
    accepted_field_keys: accepted,
    rejected_fields: rejected,
  }
}
