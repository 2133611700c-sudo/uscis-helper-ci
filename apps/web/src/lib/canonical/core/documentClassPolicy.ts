/**
 * canonical/core/documentClassPolicy.ts — Document-class OCR policy.
 *
 * Encodes benchmark findings from 2026-06-02 Cyrillic adjudication:
 * qa-private/reports/failed_cyrillic_ground_truth_adjudication_20260602.json
 * docs/reports/FAILED_CYRILLIC_GROUND_TRUTH_ADJUDICATION.md
 *
 * HARD RULES baked here (do not remove without a new benchmark cycle):
 * - birth_cert_handwritten: gemini-2.5-pro/-flash CATASTROPHICALLY wrong (wrong person).
 *   Only gemini-3.1-flash-image reads correct identity. always_review=true, no auto-final.
 * - birth_cert_soviet_bilingual: same wrong-person failure. USSR bilingual layer
 *   confuses generic extraction. always_review=true, no auto-final.
 * - marriage_apostille: no verified ground truth. 82KB image = too small. always_review=true.
 * - internal_passport_booklet / military_id: all models correct on tested corpus.
 *   auto_fill_allowed=true with mandatory patronymic/uncertain-field review.
 * - gemini-2.5-pro DISQUALIFIED for certificates: wrong person + review_required=false
 *   (false confidence) = most dangerous failure mode in a legal pipeline.
 * - gemini-2.0-flash / gemini-2.0-flash-lite: deprecated, HTTP 404.
 * - gemini-3.1-flash-image: NOT a global default. Per-class candidate only.
 * - Cyrillic is NOT solved globally. Per-class policy only.
 */

export const DOCUMENT_CLASS_POLICY = {
  internal_passport_booklet: {
    auto_fill_allowed: true,
    always_review: false,
    review_required_fields: ['patronymic'],
    final_without_review: false,
    model_candidate: 'gemini-3.1-flash-image',
    notes: 'Benchmark: all models correct. Patronymic often missing — review only that field.',
  },
  military_id: {
    auto_fill_allowed: true,
    always_review: false,
    review_required_fields: ['uncertain_fields'],
    final_without_review: false,
    model_candidate: 'gemini-3.1-flash-image',
    notes: 'Benchmark: all models correct on tested sample. Needs more corpus before auto-final.',
  },
  birth_certificate_handwritten: {
    auto_fill_allowed: false,
    always_review: true,
    final_without_review: false,
    auto_final: false,
    model_candidate: 'gemini-3.1-flash-image',
    reason: 'wrong_person_selected observed in benchmark — different human returned',
    requires_birth_certificate_schema: true,
    notes:
      'Must use birth-cert-specific schema with child/parent role separation. gemini-2.5-pro/-flash DISQUALIFIED — returned wrong person identity (different family name, given name, birth year, city). gemini-3.1-flash-image reads correct owner identity but DOB uncertain.',
  },
  birth_certificate_soviet_bilingual: {
    auto_fill_allowed: false,
    always_review: true,
    final_without_review: false,
    auto_final: false,
    model_candidate: 'gemini-3.1-flash-image',
    reason: 'wrong_person_selected and bilingual_layer_confusion observed',
    requires_birth_certificate_schema: true,
    notes:
      'Soviet forms have UA+RU layers. Generic extraction confuses blocks. gemini-2.5-pro set review_required=false while returning the wrong person — most dangerous failure mode observed in benchmark.',
  },
  marriage_apostille: {
    auto_fill_allowed: false,
    always_review: true,
    final_without_review: false,
    auto_final: false,
    reason: 'insufficient_data — 82KB image too small for reliable extraction',
    requires_rescan_if_low_size: true,
    min_image_bytes: 300_000,
    notes: 'Rescan required at 300 DPI before extraction can be trusted. No ground truth verified.',
  },
  unknown_document: {
    auto_fill_allowed: false,
    always_review: true,
    final_without_review: false,
    auto_final: false,
    notes: 'Unknown class — never auto-final.',
  },
} as const

export type DocumentClass = keyof typeof DOCUMENT_CLASS_POLICY

// ---------------------------------------------------------------------------
// Document-type ID → DocumentClass mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps a docintel document type ID (used by Translation and Core paths)
 * to a DocumentClass key for policy lookup.
 *
 * docintel IDs: ua_internal_passport_booklet, ua_international_passport,
 * ua_birth_certificate, ua_marriage_certificate, etc.
 *
 * Handwritten vs. Soviet-bilingual distinction is not yet in the docintel ID —
 * all birth certificates default to the stricter handwritten class until
 * the docintel registry distinguishes them.
 */
export function docintelIdToDocumentClass(docTypeId: string): DocumentClass {
  const map: Record<string, DocumentClass> = {
    ua_internal_passport_booklet: 'internal_passport_booklet',
    ua_international_passport: 'internal_passport_booklet', // international = same model policy as booklet
    ua_birth_certificate: 'birth_certificate_handwritten',  // conservative: assume handwritten until schema says otherwise
    ua_marriage_certificate: 'marriage_apostille',
    ua_divorce_certificate: 'marriage_apostille', // same vintage hand-filled cert family (2026-06-11)
    ua_military_id: 'military_id',
  }
  return map[docTypeId] ?? 'unknown_document'
}

/**
 * Maps a TPS wizard docHint (passport/booklet/i94/ead/dl/i797/tps_notice...)
 * to a DocumentClass key for policy lookup.
 *
 * US-form slots (i94/ead/dl/i797/tps_notice) are not Ukrainian identity docs
 * and are not covered by the Cyrillic benchmark. They map to 'unknown_document'
 * so the policy does not accidentally apply hard-case treatment to US forms.
 * The auto-fill guard (isAutoFillAllowed) will return false for unknown_document
 * which is the safe default — but review_required is not forced for these
 * because they have their own per-slot policies in documentContracts.ts.
 */
export function tpsHintToDocumentClass(hint: string): DocumentClass {
  const map: Record<string, DocumentClass> = {
    passport: 'internal_passport_booklet', // international passport (TD3)
    booklet: 'internal_passport_booklet',  // Ukrainian internal passport-booklet
    military_id: 'military_id',            // Ukrainian military booklet
    birth_certificate: 'birth_certificate_handwritten', // birth cert (conservative default)
    // US-form slots — not Ukrainian identity docs, policy does not apply
    // Return unknown_document but callers must check isUkrainianIdentityDoc first
  }
  return map[hint] ?? 'unknown_document'
}

/**
 * Returns true if the docHint or docTypeId is a Ukrainian identity document
 * that should be subject to the documentClassPolicy guards.
 * US-form slots (i94/ead/dl/i797/tps_notice) are excluded.
 */
export function isUkrainianIdentityDoc(hintOrTypeId: string): boolean {
  const ukrainian = new Set([
    'passport', 'booklet',
    'ua_internal_passport_booklet', 'ua_international_passport',
    'ua_birth_certificate', 'ua_marriage_certificate', 'ua_military_id',
    'military_id', 'birth_certificate', // TPS wizard docHint values
  ])
  return ukrainian.has(hintOrTypeId)
}

export function isHardCase(docClass: DocumentClass): boolean {
  return DOCUMENT_CLASS_POLICY[docClass].always_review === true
}

export function isAutoFillAllowed(docClass: DocumentClass): boolean {
  return DOCUMENT_CLASS_POLICY[docClass].auto_fill_allowed === true
}

// ---------------------------------------------------------------------------
// Wrong-person guard for certificate documents
// ---------------------------------------------------------------------------

/**
 * Certificates (birth, marriage) require role-grounded field names.
 * Generic "family_name" without a role prefix (child_, spouse1_, etc.) on
 * a certificate means the model did NOT distinguish between child/parent/spouse
 * roles — the exact failure mode observed in the benchmark (wrong person selected).
 *
 * Called AFTER extraction, BEFORE any auto-fill or display to the user.
 */
export function applyCertificateRoleGuard(
  docClass: DocumentClass,
  extractedFields: Record<string, unknown>,
): { safe: boolean; reason?: string; forcedReviewFields: string[] } {
  const certificateClasses: DocumentClass[] = [
    'birth_certificate_handwritten',
    'birth_certificate_soviet_bilingual',
    'marriage_apostille',
  ]

  if (!certificateClasses.includes(docClass)) {
    return { safe: true, forcedReviewFields: [] }
  }

  // For birth certs: child fields must be distinct from parent fields.
  // For marriage: spouse_1 and spouse_2 must be role-grounded.
  // If model returns generic "family_name" without role on a certificate → reject.
  const hasRoleGrounding =
    extractedFields['child_family_name'] !== undefined ||
    extractedFields['spouse1_family_name'] !== undefined

  if (!hasRoleGrounding && extractedFields['family_name'] !== undefined) {
    return {
      safe: false,
      reason: 'role_not_grounded — generic name field on certificate document',
      forcedReviewFields: ['family_name', 'given_name', 'patronymic'],
    }
  }

  return { safe: true, forcedReviewFields: [] }
}

// ---------------------------------------------------------------------------
// Hard-case review override
// ---------------------------------------------------------------------------

/**
 * On hard-case document classes, the model's own review_required=false is NOT
 * trusted. Benchmark proof: gemini-2.5-pro set review_required=false while
 * returning the wrong person on birth_cert_soviet. This override is applied
 * to ALL hard-case classes unconditionally.
 */
export function applyHardCaseReviewOverride(
  docClass: DocumentClass,
  modelOutput: { review_required?: boolean; [key: string]: unknown },
): { review_required: true; override_reason?: string } | typeof modelOutput {
  if (isHardCase(docClass)) {
    return {
      ...modelOutput,
      review_required: true as const,
      override_reason: `hard_case_class:${docClass} — model review_required not trusted`,
    }
  }
  return modelOutput
}

// ---------------------------------------------------------------------------
// Image quality guard
// ---------------------------------------------------------------------------

export const IMAGE_QUALITY_RULES = {
  min_bytes_for_extraction: 100_000,     // 100 KB minimum
  min_bytes_marriage_apostille: 300_000, // 300 KB for apostille (82 KB proved insufficient)
  max_bytes_before_resize: 2_000_000,    // 2 MB — resize above this to avoid 503 on Gemini
  target_resize_bytes: 1_500_000,
} as const

export function checkImageQuality(
  docClass: DocumentClass,
  imageSizeBytes: number,
): { ok: boolean; action: 'proceed' | 'resize' | 'needs_better_scan'; reason?: string } {
  if (imageSizeBytes > IMAGE_QUALITY_RULES.max_bytes_before_resize) {
    return {
      ok: false,
      action: 'resize',
      reason: `image_too_large:${imageSizeBytes}bytes — resize to <2MB`,
    }
  }

  const minBytes =
    docClass === 'marriage_apostille'
      ? IMAGE_QUALITY_RULES.min_bytes_marriage_apostille
      : IMAGE_QUALITY_RULES.min_bytes_for_extraction

  if (imageSizeBytes < minBytes) {
    return {
      ok: false,
      action: 'needs_better_scan',
      reason: `image_too_small:${imageSizeBytes}bytes — minimum ${minBytes}bytes for ${docClass}`,
    }
  }

  return { ok: true, action: 'proceed' }
}
