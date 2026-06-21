# TPS Form Filler Architecture v1.0 — built on Translation Engine v5

**Status:** target architecture for the TPS Ukraine multi-agent packet
constructor. Parallel to `docs/translation/DOCUMENT_TRANSLATION_ENGINE_V5.md`.

The translation engine v5 is the reference implementation. The TPS form
filler reuses the same pipeline shape, the same module/classifier pattern,
the same source-trace discipline, the same manual review fall-through,
and the same audit log infrastructure. **Where v5 produces a translation
PDF, TPS produces a prefilled USCIS form packet.** Everything else is
the same engineering posture.

---

## 1. Product Posture — same as v5

We prepare an **AI-assisted draft** that becomes a real USCIS submission
only after a competent human (the applicant) reviews and files it. We
do not file with USCIS, do not give legal advice, are not USCIS-affiliated,
never claim "USCIS-accepted". Enforced by `check-content-guards.sh`.

## 2. Controlled Autonomy — same as v5

Automation handles repetitive work. Critical facts and final submission
stay human-accountable. Concretely:

- the packet renderer **never** ships a final ZIP until `TpsPacketState`
  shows: `user_accepted_review && payment_confirmed (when applicable)
  && qa_result.PASS && all critical fields filled or explicitly waived`.
- the document classifier **never** prefills from an unknown document —
  it routes to `manual_review_required`.
- the prefiller **never** copies anything "that seems likely". Every
  value in the output PDF comes from a `TpsSourceTrace` row.

## 3. Pipeline (deterministic order, mirrors v5 §3)

```
Upload (passport / I-94 / EAD / evidence) — Step 2 of wizard
 → ImageQualityGate
 → OCRProvider              (Google Vision; bbox + raw_text)
 → DocumentClassifier       (modules/tps/classifier.ts)
 → ModuleRegistry           (modules/tps/registry.ts:
                             passport / i94 / ead / evidence /
                             manual_review_required)
 → ZoneExtractor            (zoneExtractor.ts — REUSED from v5 for
                             passport MRZ + visual zone;
                             new I-94 zone parser; new EAD zone parser)
 → FieldExtractor           (extraction/<doc>ExtractionPrompt.ts;
                             DeepSeek vision-mapper for low-confidence)
 → NumericAccuracy          (dateFieldLock for DOB/expiry/entry;
                             digitShapeComparator for digits;
                             monthMapValidator for date roundtrips)
 → Glossary                 (USCIS state codes, country names,
                             EAD category enum [a12 / c19])
 → ModuleValidators         (per-doc: passport ≥6 months valid,
                             I-94 admission_number = 11 digits, etc.)
 → PathClassifier           (modules/tps/pathClassifier.ts:
                             initial / re_registration / pending /
                             ead_only / not_sure  →  manual_review)
 → SourceTraceValidator     (every TpsAnswers field has a TpsSourceTrace)
 → TpsEvidenceBuilder       (TpsPacketState.extracted_fields with
                             source_label, bbox, language_layer,
                             confidence, ocr_ids, evidence_crop_path)
 → ReviewState              (TpsReviewPage — Step 5 of wizard;
                             one "Изменить" per row, "Дальше" = accept-all)
 → CorrectionClassifier     (correctionClassifier.ts — REUSED;
                             user edit → ocr_correction / explicit_override
                             / suspected_typo)
 → AttestationGate          (user clicks "Я проверил, всё правильно";
                             stores attestation_record analog of v5
                             CertificationRecord)
 → PaymentGate              (paymentGateValidator.ts — REUSED;
                             only when business decision turns on payment)
 → RenderGate               (tpsPacketQaValidator + sourceToFormFieldAudit)
 → PDFPrefiller             (pdfPrefiller + per-form fieldMap:
                             I-821 / I-765 / I-912) — EXISTS
 → PacketBuilder            (packetBuilder.ts — wraps prefilled PDFs +
                             README + evidence index into ZIP) — EXISTS
 → AdminAuditArtifact       (manual_review_events + audit_log) — REUSED
```

## 4. Core Types (parallel to v5 §4)

```ts
// apps/web/src/lib/tps/types.ts  (to be created in SPRINT-OCR)

interface TpsExtractedField {
  field: string                  // e.g. 'passport_number'
  source_label: string           // e.g. 'passport_visual_zone' | 'i94_box_1'
  source_zone: string            // structured zone ID
  bbox: [number, number, number, number]
  raw_value: string              // raw OCR string
  normalized_value: string       // canonical form
  language_layer: 'cyrillic' | 'latin' | 'mrz' | 'numeric'
  confidence: number             // 0..1
  review_required: boolean       // true if confidence < threshold
  passes: string[]               // which validator passes confirmed it
  ocr_ids: string[]              // upstream OCR result IDs
  evidence_crop_path?: string    // optional cropped image path
  bbox_status: 'verified' | 'inferred' | 'low_confidence'
  user_corrected: boolean
  correction_class?: 'ocr_correction' | 'explicit_override' | 'suspected_typo'
}

interface TpsSourceTrace {
  // same shape, snapshotted after user review
}

interface TpsPacketState {
  session_id: string
  locale: 'uk' | 'ru' | 'en' | 'es'
  uploaded_documents: Array<{ id: string; type: TpsDocType; pages: number }>
  extracted_fields: TpsExtractedField[]
  source_traces: TpsSourceTrace[]
  user_corrections: Array<{ field: string; from: string; to: string; class: string }>
  tps_answers: TPSAnswers          // already exists
  path_decision: 'initial' | 're_registration' | 'pending_auto_extended' | 'ead_only' | 'manual_review_required'
  attestation_record?: TpsAttestationRecord
  payment_confirmed: boolean
  qa_result: { status: 'PASS' | 'FAIL' | 'PENDING'; checks: string[]; failures: string[] }
  scope_title: 'TPS Ukraine initial' | 'TPS Ukraine re-registration' | 'EAD only'
}

interface TpsAttestationRecord {
  applicant_full_name: string
  statement: string                // "I have reviewed every field and
                                    //  affirm they reflect my information.
                                    //  I will personally file with USCIS."
  signature_typed_name: string
  signed_at: string                // ISO timestamp
  attestation_version: 'v1.0-2026'
}
```

## 5. Modules (parallel to v5 §5 DocumentModule framework)

| Module | Status | allowAutoPrefill | Notes |
|---|---|---|---|
| `tps_passport_ukraine_intl`   | active  | true  | MRZ + visual zone, reuses v5 mrzParser |
| `tps_i94`                     | active  | true  | New; CBP printout / screenshot |
| `tps_ead_card`                | active  | true  | New; USCIS card format |
| `tps_i797_receipt`            | active  | true  | New; for pending applications |
| `tps_residence_evidence`      | active  | false | OCR address ONLY when user opts in; do NOT auto-OCR all uploaded evidence (per Taras's address-vs-evidence rule) |
| `tps_translated_document`     | active  | false | If user uploads non-English doc, route to Translation Engine v5 first |
| `manual_review_required`      | manual  | false | Sentinel — never auto-prefills |

## 6. Date format — USCIS form expects MM/DD/YYYY

Different from v5 (which renders translations in `12 May 1990` EU format
to avoid ambiguity). USCIS forms have their own date convention. We
already convert internally: `toUscisDate(iso)` in `lib/tps/answers.ts`.

## 7. Source-to-FormField Audit (parallel to v5 §7)

`sourceToFormFieldAudit.ts` runs before packetBuilder writes the ZIP.
Compares:
- OCR zones extracted
- → `extracted_fields` (TpsExtractedField[])
- → `source_traces` (post user review)
- → values that landed in each PDF form-field
- → final ZIP contents

Fails on:
- source field exists (e.g., passport surname) but is missing in the
  PDF prefill output
- PDF prefill contains a field with no source_trace (e.g., a typo we
  somehow invented)
- a number or date changed between review and final PDF
- TpsAnswers.passport_number disagrees with extracted_fields entry of
  same name

## 8. Correction Classifier (REUSED from v5)

User edits the OCR-extracted value on the review screen. Classifier
labels:
- `ocr_correction` — OCR made a digit/letter mistake (training signal,
  may propagate to OCR model improvement)
- `explicit_override` — user knowingly overrode (e.g., uses different
  legal name on USCIS forms than what's on passport)
- `suspected_typo` — heuristic flags possible user typo (e.g., 9-digit
  Ukrainian passport when standard is 8) — wizard shows soft warning,
  user can confirm

Same module `correctionClassifier.ts` works — only the field whitelist
differs.

## 9. Manual Review Triggers (per V6 §6 + this architecture)

The PathClassifier routes to `manual_review_required` when any of:
- OCR confidence on any critical field < 0.6
- MRZ checksum failure on passport
- TpsAnswers.has_criminal_concern == true
- TpsAnswers.has_prior_tps_denial == true
- TpsAnswers.left_us_without_advance_parole == true
- Inconsistent dates: passport DOB ≠ user-typed DOB ≠ I-94 DOB
- I-94 admission_number length ≠ 11
- Last entry date > 2023-08-16 AND filing_path == 'initial' (ineligible)
- ead_category mismatch with filing_path

Manual Review Queue v1 (already in prod) consumes these tickets via
the same `createManualReviewTicket` path the Translation Engine uses.

## 10. Privacy + Audit (REUSED from v5)

- No PII in logs/telemetry; `safeMetadata.ts` whitelist applies.
- Customer-facing PDF MUST NOT include: `source_trace`, `bbox`,
  `ocr_id`, internal QA, "CERTIFIED BY AI", "USCIS-ACCEPTED".
- Admin audit artifact is separate: `manual_review_events` +
  `audit_log` + `extracted_fields` with bbox.
- Documents auto-delete after 30 days (config flag).

## 11. Forbidden Phrases — same `SERVICE_CLAIMS_POLICY.md`

The TPS service inherits the same forbidden-claim scan in CI. New TPS-
specific additions:
- "USCIS will accept" / "USCIS примет"
- "guaranteed approval"
- "we file your TPS for you"
- "automatically processed" (because USCIS processes, not us)
- "you can rely on us for legal questions"

---

## 12. File Map (target)

```
docs/tps/
  ARCHITECTURE_V1.md                       (this file)
  TPS_DATA_CONTRACT_V1.md                  (TBD — full TPSAnswers + V6 schema)
  TPS_PIPELINE_OPERATIONS.md               (TBD — runbook)
  TPS_QA_AND_VERSIONING_PROTOCOL.md        (TBD — fixture matrix)
docs/uscis/forms/tps/
  forms_manifest.json                      (EXISTS — current SHA + edition)
  field_inventory_*.{md,json}              (EXISTS — 945 fields catalogued)
  tps_field_mapping_v1.md                  (EXISTS — TPSAnswers → PDF field)
  AUDIT_REPORT.md                          (EXISTS — zero-trust audit)
docs/agent_tasks/
  TPS_UKRAINE_FACTS_2026-05-10.yaml        (EXISTS — operational facts)
  TPS_5_AGENT_ARCHITECTURE.yaml            (EXISTS — agent allocation)
  TPS_NEXT_CYCLES_PLAN.yaml                (EXISTS — cycle plan)

apps/web/src/lib/tps/
  answers.ts                               (EXISTS — TPSAnswers contract)
  packetBuilder.ts                         (EXISTS — top-level orchestrator)
  pdfPrefiller.ts                          (EXISTS — pdf-lib engine)
  forms/
    i821FieldMap.ts                        (EXISTS — partial; expand to ~80 fields)
    i765FieldMap.ts                        (EXISTS — partial; expand to ~30 fields)
    i912FieldMap.ts                        (TBD — fee waiver)
  __tests__/
    packetBuilder.test.ts                  (EXISTS — 6 fixture tests)
  types.ts                                 (TBD — TpsExtractedField, TpsPacketState)
  modules/
    types.ts                               (TBD — DocumentModule for TPS)
    registry.ts                            (TBD — module dispatch)
    classifier.ts                          (TBD — document type classifier)
    pathClassifier.ts                      (TBD — initial vs re_reg vs manual)
    passport.module.ts                     (TBD — passport extractor)
    i94.module.ts                          (TBD)
    ead.module.ts                          (TBD)
    i797.module.ts                         (TBD)
    residenceEvidence.module.ts            (TBD)
  validators/
    sourceTraceValidator.ts                (REUSE from v5)
    paymentGateValidator.ts                (REUSE)
    correctionClassifier.ts                (REUSE)
    tpsPacketQaValidator.ts                (TBD — TPS-specific)
    sourceToFormFieldAudit.ts              (TBD — parallel to v5 §7)
  identity/
    mrzParser.ts                           (REUSE from v5)
    passportZoneExtractor.ts               (REUSE/adapt)
  prompts/
    passportExtractionPrompt.ts            (TBD — DeepSeek)
    i94ExtractionPrompt.ts                 (TBD)
    eadExtractionPrompt.ts                 (TBD)
  manualReview/
    integrations.ts                        (REUSE — wire TPS triggers)
  agent/
    tpsSystemPrompt.ts                     (TBD — analogue of
                                            translation-agent-system.md)

scripts/uscis/
  refresh_tps_forms.sh                     (EXISTS — re-download + manifest)
  smoke_tps_packet.sh                      (EXISTS — post-deploy smoke)
  build_manifest.py                        (EXISTS)
  inventory_fields.py                      (EXISTS)
```

## 13. Acceptance criteria for "TPS form filler v1.0" (parallel to v5 PILOT)

Before we claim v1.0:

1. End-to-end fixture: synthetic passport image + synthetic I-94 →
   pipeline produces correct TPSAnswers → pipeline produces filled
   I-821 + I-765 ZIP → `sourceToFormFieldAudit` PASS → smoke script
   PASS against production.

2. Adobe visual proof: filled I-821 + I-765 open in Adobe Reader AND
   Apple Preview AND show prefilled values in their correct boxes
   (screenshots saved as CI artifacts).

3. Manual review fall-through: synthetic passport with corrupted MRZ
   checksum → pipeline routes to manual_review_required → ticket
   appears in admin queue → operator can see the failed checks (with
   PII-safe metadata).

4. Privacy gate: customer ZIP contains zero references to
   `source_trace`, `bbox`, `ocr_id`, internal QA strings.

5. Edition drift: changing one PDF in `apps/web/public/uscis/tps/`
   without updating `forms_manifest.json` → CI fails.

6. Source-to-final audit: changing a field's `normalized_value` after
   user review → audit FAILS (test in fixture).

7. Forbidden-claim scan: any new RU/UK/EN/ES copy that contains a
   policy-forbidden phrase fails `check-content-guards.sh`.

---

## 14. What this means for the OCR sprint

When we run SPRINT-OCR, the work is NOT "build OCR from scratch". It is:
1. **Reuse** v5's `mrzParser`, `zoneExtractor`, `correctionClassifier`,
   `safeMetadata`, `manualReview` plumbing, `audit_log`.
2. **Port** the per-module pattern: classifier → module → validator.
3. **Add** TPS-specific modules: i94, ead, i797, residenceEvidence.
4. **Add** TPS-specific audits: `sourceToFormFieldAudit`,
   `tpsPacketQaValidator`.
5. **Add** the review screen with the locked UX pattern (see
   `docs/ux/SELF_REVIEW_PATTERN.md`).

The translation engine already proved the architecture. The TPS form
filler is a sibling, not a rewrite.
