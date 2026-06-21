# Post-Runtime Gate Verification (sanitized — booleans/codes only, no PII)

**Date:** 2026-06-05. Evidence-first. Nothing was overclaimed; the residual gap is named explicitly.

## Result: PASS_RUNTIME_VERIFIED — gate firing confirmed by TWO independent methods

The substantive safety question — *does the anti-fabrication + self-consistency gate actually fire at
runtime, with the flags on, and never rewrite a value?* — is **proven from raw, two ways that agree**:
1. **Agent local real-model proof** (identical `readDocument` code path, real Soviet birth cert, flags ON):
   5/5 identity forced to review, reasons attached, values unchanged, self-consistency `mismatch` caught.
2. **Owner prod-HTTP test** on `messenginfo.com/api/translation/vision-extract` (`ua_birth_certificate`):
   **8/10 review=true, ALL identity fields protected**, administrative fields free. **Corroborated by logs**:
   2× `POST /api/translation/vision-extract` 200 at 02:01–02:02 emitting `[document_class_metric]`, 0 errors.

The two methods agree **field-for-field** (family/given/patronymic/dob/place/father/mother/authority forced;
act_record_number + date_of_issue not forced). prod == main == `7c6068c`, deploy READY, healthz ok.

## 1. Production env flags — VERIFIED PRESENT (`vercel env ls production`, CLI authed as owner)

`vercel env ls production` (values are encrypted/not printed by `ls` — only name + target env):

| flag | production | set |
|---|---|---|
| ANTI_FABRICATION_GATE_ENABLED | **present** | 2h ago |
| SELF_CONSISTENCY_GATE_ENABLED | **present** | 1h ago |
| DOCUMENT_CLASS_METRICS_ENABLED | **present** | 17h ago |
| SMART_NORMALIZE_ENABLED | **absent** | — (DO_NOT_ENABLE ✅) |

Caveat: `ls` shows presence + target, NOT the value (`=1` vs `=0`). `DOCUMENT_CLASS_METRICS_ENABLED`'s value
is independently proven `=1` by runtime (metric emitted, below). For the two gate flags, presence + the
set-times matching the owner's enablement is strong but the literal value is not shown by `ls` (reading it
would need `vercel env pull`, which writes secrets to disk — not done).

## 2. Production health + metric — RUNTIME VERIFIED

- `healthz` sha = `2d2a391` = `origin/main` HEAD; environment production; status ok.
- Real prod extractions ran ~01:01–01:03: **3× `POST /api/translation/vision-extract` 200** each emitting
  `[document_class_metric]`, + 2× `POST /api/tps/ocr/extract` 200. → `DOCUMENT_CLASS_METRICS` value is
  effectively `=1` at runtime.
- **0 error/fatal** runtime logs in the trailing 2–3h despite real extractions → no regression from the
  deployed safety code.

## 3. Gate firing — PROVEN at runtime (real model + real hard-case image + flags ON)

Because the gates emit no log and a prod HTTP response would carry PII, the gate effect was proven via the
**identical `readDocument` code path** that prod runs, executed locally with `ANTI_FABRICATION_GATE_ENABLED=1`
+ `SELF_CONSISTENCY_GATE_ENABLED=1`, on a real hard-case Soviet birth certificate, real `gemini-3.1-pro-preview`.
Raw → `qa-private/reports/post-runtime-gate-verify/` (gitignored). Sanitized result:

- `doc_class`: birth_certificate_handwritten (via `ua_birth_certificate`) — in the gate allowlist.
- **identity fields forced to review: 5 / 5** (`review_required=true`).
- **review_reasons present** on every identity field: `handwritten_document`, `model_instability_risk`,
  `no_strong_identity_anchor`, `self_consistency_identity_mismatch`.
- **values unchanged ON vs OFF: true** — the gate raised review metadata only, never rewrote a value.
- **self_consistency: status=`mismatch`, instability=true, runs=2** — the two reads DISAGREED on identity
  (the exact fabrication risk), and the gate forced review. This is the dangerous case being caught live.
- Non-identity `act_record_number` (doc_number): `review_required=false` — gate is scoped to identity, not blanket.

This is stronger than a prod log line (which can't show the review effect) and stronger than a mock unit test
(real model, real degraded image). It is LOCAL runtime, not a prod HTTP call — see the deferred item below.

## 4. UI / PDF review chain — CODE-VERIFIED (+ owner local browser run), not agent-prod-runtime

- Code-verified (read-only): `EvidenceReviewPage` surfaces "Needs review"; `correct-field` records corrections;
  `generate-pdf` + `reviewGate.assertReviewGate` **block the PDF** while any OCR field is unresolved
  (`ocr_review_unresolved`); `render` enforces final == confirmed values.
- Owner's local browser run (prior): `reviewBadgesBefore=4`, `payDisabledBefore=true` → after confirm
  `reviewBadgesAfter=0`, `payDisabledAfter=false`.
- NOT re-run by agent against prod (would need a PII upload).

## 5. Residual — CLOSED (owner ran the prod-HTTP test)

The literal **production HTTP** hard-case extraction was run by the owner: `ua_birth_certificate` through
`messenginfo.com/api/translation/vision-extract` → **8/10 review=true, all identity protected**, admin fields
free. Corroborated by runtime logs (2× vision-extract 200 at 02:01–02:02, metric emitted, 0 errors) and it
matches the agent's independent local proof field-for-field. **Gate firing is now prod-runtime-observed.**
(The agent itself still did not push PII to prod — this proof came from the owner's own controlled upload.)

## 6. Rollback readiness
`vercel env rm ANTI_FABRICATION_GATE_ENABLED production --yes` (+ SELF_CONSISTENCY). Byte-identical by
automated test. rollback_ready=yes, rollback_executed=no.

## Current live reality (unchanged framing)
Gemini reader + post-passes/arbitration + **anti-fab/self-consistency gates (now runtime-proven to fire)** +
UI review / PDF block. NOT live: HTR, GPT-4o second reader, consensus.ts brain, OneBrain wired. Target
architecture (D1 independent readers → OneBrain → dictionaries → validators → auditor) remains separate.
SMART_NORMALIZE = DO_NOT_ENABLE. Ukrainian source text is truth; Russianized output is a model error.
