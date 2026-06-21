# Document Translation Engine v5.0 — Engineering Standard

**Status:** Implementation reference for the messenginfo Ukrainian-document
translation pipeline. Companion documents: USCIS_TRANSLATION_STANDARD,
UKRAINE_PASSPORT_BOOKLET_RULES, UKRAINE_GLOSSARY, TRANSLITERATION_PRIORITY,
NUMERIC_ACCURACY_PROTOCOL, TRANSLATION_QA_AND_VERSIONING_PROTOCOL,
SERVICE_CLAIMS_POLICY, MODULE_ACCEPTANCE_MATRIX, MANUAL_REVIEW_QUEUE.

**Source artifact:** `DOCUMENT_TRANSLATION_ENGINE_V5.pdf` beside this file —
the original 14-page formatted PDF that supersedes the older "TPS Translation
Pipeline v3.0" memory note for the standalone document-translation scope.
This `.md` is the implementation-aligned summary; the `.pdf` is authoritative
for any phrasing dispute. Provider-policy reminder: DeepSeek-first for
AI/API; **vision provider remains pluggable** (exercised by `lib/docintel`).

**Core rule.** A translation is not finished when it looks good. It is
finished only when every critical field is traceable back to the original
document AND a competent human signs the certification.

---

## 1. Product Posture

The service prepares an **AI-assisted draft** that becomes a **certified
translation only after a competent human reviews and signs** the
8 CFR §103.2(b)(3) statement. Service is not a law firm, not legal advice,
not USCIS-affiliated, never claims "USCIS-accepted" or "certified by AI".
See `SERVICE_CLAIMS_POLICY.md`.

## 2. Controlled Autonomy

Automation handles repetitive work. Critical facts and certification stay
human-accountable. Concretely:

- the renderer **never** ships a final PDF until `PacketState` shows:
  payment_confirmed && certification_record signed && qa_result.PASS
  && all critical fields confirmed by user.
- the classifier **never** routes an unknown document to auto-PDF — it
  routes to `manual_review_required`.
- the renderer **never** copies anything from "previous drafts" or
  "what seems likely". Every value comes from a `SourceTrace`.

## 3. Pipeline (deterministic order)

```
Upload
 → ImageQualityGate
 → OCRProvider          (Google Vision; bbox + raw_text)
 → DocumentClassifier   (modules/classifier.ts)
 → ModuleRegistry       (modules/registry.ts)
 → ZoneExtractor        (zoneExtractor.ts; v5 §9)
 → FieldExtractor       (extraction/<module>ExtractionPrompt.ts; DeepSeek)
 → NumericAccuracy      (dateFieldLockValidator, passportPerforationValidator,
                         digitShapeComparator, monthMapValidator)
 → GlossaryResolver     (glossary/glossaryLoader, agencyGlossary,
                         civil_registry_terms)
 → ModuleValidators     (validators/<module>Validators.ts)
 → SourceTraceValidator (sourceTraceValidator.ts)
 → EvidenceBuilder      (PacketState.extracted_fields with source_label,
                         source_zone, bbox, language_layer, confidence,
                         passes, ocr_ids, evidence_crop_path)
 → ReviewState          (EvidenceReviewPage; user confirms critical fields)
 → CorrectionClassifier (correctionClassifier.ts; classifies user edits as
                         controlling_spelling | ocr_error |
                         one_document_exception)
 → CertificationGate    (certify endpoint; certificationRecordValidator)
 → PaymentGate          (paymentGateValidator.ts)
 → RenderGate           (translationQaValidator + sourceToFinalAudit)
 → PDFRenderer          (bureauStyleRenderer + per-module template)
 → AdminAuditArtifact   (manual_review_events + audit_log)
```

## 4. Core Types (apps/web/src/lib/translation/types.ts)

- `ExtractedField` — field, source_label, source_zone, bbox, raw_value,
  normalized_value, language_layer, confidence, review_required, **passes**,
  ocr_ids, evidence_crop_path, evidence_type, bbox_status,
  user_corrected, correction_class.
- `SourceTrace` — same shape, snapshotted post-review.
- `PacketState` — session_id, document_type, controlling_spelling,
  uploaded_pages, total_pages_declared, extracted_fields, source_traces,
  user_corrections, certification_record, payment_confirmed,
  payment_checkout_id, qa_result, scope_title, locale.
- `CertificationRecord` — signer_full_name, statement, signature_typed_name,
  signed_at, source_language, address, certification_version
  (currently `v1.0-8cfr-2026`).

## 5. Modules (DocumentModule framework)

See `DOCUMENT_MODULE_FRAMEWORK.md` and `MODULE_ACCEPTANCE_MATRIX.md`.

| Module | Status | allowAutoPdf | Notes |
|---|---|---|---|
| ua_internal_passport_booklet | active | true | Real OCR + customer PDF + privacy QA proven |
| ua_birth_certificate         | draft  | false | Demoted 2026-05-09 — no real fixture |
| ua_marriage_certificate      | draft  | false | Demoted 2026-05-09 — no real fixture |
| ua_divorce_certificate       | draft  | false | Demoted 2026-05-09 — no real fixture |
| ua_international_passport    | draft  | false | Anchor candidate, not auto-PDF |
| ua_id_card                   | draft  | false | Anchor candidate, not auto-PDF |
| manual_review_required       | manual_only | false | Sentinel — never auto-PDFs |

## 6. Date Format

USCIS-safe **EU format**: `12 May 1990` (locale `en-GB`, month long).
Never `May 12, 1990` — ambiguous between US/EU.

## 7. Source-to-Final Audit (v5 §23)

`sourceToFinalAudit.ts` runs before render. Compares:
- source zones extracted (OCR result)
- → draft fields (`ExtractedField[]`)
- → user-confirmed fields (`source_traces[]`)
- → final rendered PDF text
- → attached original pages count

Fails on:
- source field exists but is missing in translation
- final translation contains a field not in source/user-approved packet
- number/date changed between review and final render
- scope title broader than uploaded pages
- original pages not attached

## 8. Correction Classifier (v5 §22)

Translation Memory grows ONLY from user edits classified as either
`controlling_spelling` or `one_document_exception`. Edits classified as
`ocr_error` stay local to the session — they never propagate.

## 9. Privacy + Audit

- No PII in logs/telemetry. `manualReview/safeMetadata.ts` enforces a
  whitelist.
- Customer PDF MUST NOT include: `source_trace`, `bbox`, `ocr_id`,
  `internal QA`, `Translator Note`, "CERTIFIED COPY".
- Admin audit artifact is separate (manual_review_events + audit_log
  + extracted_fields with bbox).

## 10. Forbidden Phrases (Service Claims Policy)

Enforced by `apps/web/scripts/check-content-guards.sh` on every CI run.
See `SERVICE_CLAIMS_POLICY.md`.

---

## File Map (current + v5 §36 contract)

```
docs/translation/
  DOCUMENT_TRANSLATION_ENGINE_V5.md          (this file)
  USCIS_TRANSLATION_STANDARD.md
  UKRAINE_PASSPORT_BOOKLET_RULES.md
  UKRAINE_GLOSSARY.yaml
  TRANSLITERATION_PRIORITY.md
  NUMERIC_ACCURACY_PROTOCOL.md
  TRANSLATION_QA_AND_VERSIONING_PROTOCOL.md
  SERVICE_CLAIMS_POLICY.md
  MODULE_ACCEPTANCE_MATRIX.md
  MANUAL_REVIEW_QUEUE.md
  DOCUMENT_MODULE_FRAMEWORK.md
  PILOT_ACCEPTANCE_CRITERIA.md

prompts/
  translation-agent-system.md

apps/web/src/lib/translation/
  bureauStyleRenderer.ts
  certificationRecord.ts
  certificationRecordValidator.ts
  correctionClassifier.ts
  packetStateManager.ts
  paymentGateValidator.ts
  sourceToFinalAudit.ts
  sourceTraceValidator.ts
  translationQaValidator.ts
  zoneExtractor.ts
  numericAccuracy/
    dateFieldLockValidator.ts
    digitShapeComparator.ts
    monthMapValidator.ts
    passportPerforationValidator.ts
  modules/
    types.ts
    registry.ts
    classifier.ts
    adapters.ts
    passportBooklet.module.ts
    birthCertificate.module.ts
    marriageCertificate.module.ts
    divorceCertificate.module.ts
    internationalPassport.module.ts
    ukrainianIdCard.module.ts
    manualReview.module.ts
  templates/
    passportBooklet.template.ts
    birthCertificate.template.ts
    marriageCertificate.template.ts
    divorceCertificate.template.ts
    internationalPassport.template.ts
    ukrainianIdCard.template.ts
  validators/
    birthCertificateValidators.ts
    marriageCertificateValidators.ts
    divorceCertificateValidators.ts
    internationalPassportValidators.ts
    ukrainianIdCardValidators.ts
  glossary/
    glossaryLoader.ts
    agencyGlossary.ts
    nominativeCaseRestorer.ts
    civil_registry_terms.json
    ukraine_agency_abbreviations.json
  identity/
    packetIdentityAnchor.ts
    mrzParser.ts
  manualReview/
    types.ts
    router.ts
    integrations.ts
    createManualReviewTicket.ts
    notifications.ts
    safeMetadata.ts
    useManualReviewStatus.ts
    messages.ts
    adminAuth.ts
```
