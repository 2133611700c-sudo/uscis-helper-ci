# Translation QA and Versioning Protocol — messenginfo

**Source of truth in code:** `apps/web/src/lib/translation/translationQaValidator.ts`,
`apps/web/src/lib/translation/sourceTraceValidator.ts`,
`apps/web/src/lib/translation/sourceToFinalAudit.ts`,
`apps/web/src/lib/translation/correctionClassifier.ts`,
`apps/web/src/lib/translation/paymentGateValidator.ts`,
`apps/web/src/lib/translation/certificationRecordValidator.ts`.

---

## 1. QA Gate Order (every render call walks all of these)

```
1. SourceTraceValidator       — every critical field has a SourceTrace?
2. TranslationQaValidator     — forbidden phrases, critical-field count?
3. PaymentGateValidator       — payment_confirmed=true?
4. CertificationRecordValidator — certificate signed, version current?
5. SourceToFinalAudit         — render text matches source_traces?
6. ManualReview gate          — no open ticket for this session?
7. Module gate                — module.allowAutoPdf === true?
```

If ANY of these returns `{ ok: false }` the render endpoint refuses with
HTTP 423 (Locked) for manual-review issues, HTTP 412 (Precondition Failed)
for QA failures, or HTTP 402 (Payment Required) for missing payment.

## 2. Versioning

| Artifact | Version field | Where stored |
|---|---|---|
| Certification statement | `CERTIFICATION_VERSION` (currently `v1.0-8cfr-2026`) | `certificationRecord.ts` |
| Module schema | `module.version` per module | `modules/<name>.module.ts` |
| Glossary | `version: "1.0"` in YAML | `docs/translation/UKRAINE_GLOSSARY.yaml` |
| Forbidden-phrase list | implicit, code-pinned | `translationQaValidator.ts` |

When a versioned artifact changes, the prior version stays valid for in-
flight sessions but new sessions get the new version.

## 3. Regression Tests

Every fixed production error becomes a regression test with:
- a fixture that exercises the bug
- an expected output (or an expected validator failure)
- a failing-then-passing commit pair

Test files live in `apps/web/src/**/__tests__/*.test.ts` and run via
`vitest`.

## 4. Audit Records

Every translation session produces:

- `extracted_fields` rows in Supabase (per field)
- `audit_log` row(s) for: ocr_completed, certification_completed,
  final_rendered, manual_review_opened, manual_review_closed
- if manual review: `manual_review_events` rows

PII safety: `manualReview/safeMetadata.ts` whitelists which keys may be
written to logs. Source values like names, dates, document numbers are
NEVER in `audit_log.metadata`.

## 5. Correction Classification (v5 §22)

Every user edit to a field on the EvidenceReviewPage is classified before
being persisted to translation memory:

- `controlling_spelling` — the user provided a Latin spelling that wins
  for the whole packet (and future packets of the same user)
- `ocr_error` — the OCR misread a glyph; correction is local to this
  session and NEVER promoted to translation memory
- `one_document_exception` — the user wants this field different ONLY
  for this single document (e.g. a USSR-era spelling that must stay
  legacy)

Implemented in `correctionClassifier.ts`. `Translation Memory` is fed
ONLY by `controlling_spelling` corrections.

## 6. Source-to-Final Audit (v5 §23)

`sourceToFinalAudit.ts` runs as the LAST gate before render. It
diff-compares:

```
Set A: source zones extracted from OCR (raw_value per field)
Set B: draft fields (ExtractedField[].normalized_value)
Set C: user-confirmed fields (PacketState.source_traces[].normalized_value)
Set D: final rendered text (after bureauStyleRenderer)
Set E: attached original page count
```

Fails on:
- field in A missing from B/C/D
- field in D missing from C
- value of a field in D differs from value in C
- scope_title broader than uploaded_pages
- E < 1 (no original pages attached to packet)

## 7. Forbidden Phrase Detection vs Service Claims Policy

Two layers:

- **CI guard.** `apps/web/scripts/check-content-guards.sh` blocks
  forbidden phrases in source code (UI strings, message bundles).
- **Render-time guard.** `translationQaValidator.ts::FORBIDDEN_PHRASES`
  blocks forbidden phrases in any rendered PDF text.

Both lists track the set in `SERVICE_CLAIMS_POLICY.md`.

## 8. What Constitutes a "Customer PDF"

A customer PDF is any artifact that the user can download from the wizard:
- the bureau-style English translation
- the certification page
- the optional Spanish copy

It MUST NOT contain:
- bbox coordinates
- ocr_id values
- "source trace" labels
- "internal QA" labels
- "Translator Note" labels (separate from the certification)
- any forbidden phrase from the policy

The admin audit artifact, by contrast, contains all of those — but it
is never rendered to the customer.
