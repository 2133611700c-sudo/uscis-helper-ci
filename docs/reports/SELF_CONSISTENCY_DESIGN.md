# Self-Consistency Gate — DESIGN ONLY

**Date:** 2026-06-04  **Type:** design, NO code, NO flag enable, NO prod env, NO API runs, NO push.

> **IMPLEMENTED 2026-06-04 (flag default OFF):** `docintel/selfConsistency.ts` +
> orchestration in `readDocument`. `SELF_CONSISTENCY_GATE_ENABLED` (default OFF) acts ONLY
> when `ANTI_FABRICATION_GATE_ENABLED` is also ON AND docClass ∈ handwritten allowlist;
> re-reads the same image (`SELF_CONSISTENCY_RUNS`, default 2; `SELF_CONSISTENCY_TIMEOUT_MS`),
> hashes the raw identity tuple (pre-KMU), and on mismatch/incomplete/insufficient forces
> review on identity fields + adds the reason; agreement never lowers review / never claims
> correctness. Result surfaced PII-free in `DocumentReadResult.self_consistency`
> (status/instability/hash-prefix). Also shipped: `document_class_count` metric
> (`documentClassMetric.ts`, `DOCUMENT_CLASS_METRICS_ENABLED` default OFF) to learn
> `allowlist_traffic_share`. **Honest note:** on the current narrow allowlist the
> anti-fabrication class gate ALREADY forces identity review, so self-consistency's marginal
> effect today is the added instability SIGNAL + reason (evidence/triage), not a new review;
> its review effect grows when the trigger later broadens beyond the allowlist. Tests:
> `selfConsistency.test.ts` + `documentClassMetric.test.ts`; docintel+canonical/core 317 pass;
> typecheck PASS. Different-model fanout NOT done (separate owner decision).

## Goal

A REAL fabrication detector for handwritten/ambiguous documents: read the same image more
than once and force review when the extracted IDENTITY disagrees between reads. This tracks
the confirmed failure (model returns a different person across runs with `review=false`),
which neither model choice nor quality/blur signals catch.

## Known (raw, file:line; + owner recon)

- `readDocument` calls `provider.readFields(imageBuffer, mimeType, spec, opts)` ONCE
  (`documentFieldReader.ts:43`). Spec, docTypeId and provider are all in scope → a second
  read is cheapest here.
- `arbitrateDocument(candidates)` (`canonical/core/arbitration.ts:100`) only JUDGES
  `FieldCandidate[]`; it does NOT call the provider → a second read cannot happen there.
- `crypto.createHash('sha256')` is available (repo already uses sha256/HMAC, e.g. `ownerAccess.ts`).
- Anti-fabrication gate exists, narrowed to `{birth_certificate_handwritten, birth_certificate_soviet_bilingual}` (`antiFabricationGate.ts`), flag default OFF.
- Owner recon: handwritten_birth → 3 distinct identity hashes / 3 runs on BOTH 2.5-flash AND 3.5-flash; `confidence_low=false`/`review=false` on fabrications; marriage_1939 (printed) → 1 identity / 3 runs.
- Quality calibration: blurScore/assessment do NOT discriminate fabrication risk (`QUALITY_SIGNAL_CALIBRATION.md`).

## Not confirmed / UNKNOWN

- True identity of any hard-case fixture — **UNKNOWN** (no verified GT). Stability ≠ correctness.
- Allowlist traffic share in production — **UNKNOWN** (no per-class metric/logs today).
- Real per-call latency/cost in prod — **UNKNOWN** (don't synthesize).

## Decision / recommendation

- **Insertion point:** `readDocument` (the one door all 4 products call; provider call lives
  here; arbitrate is too late). NOT route-level (would re-introduce 4× duplication). CONFIRMED.
- **Trigger scope:** the existing narrow handwritten allowlist (option A):
  `birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`.
  - B (handwritten zones) = future, once a runtime signal exists.
  - C (low_quality_scan/blurScore) = REJECT — calibration showed it doesn't discriminate.
  - D (all hard-case) = REJECT — too broad (printed marriage/unknown).
  - E (unknown_document) = REJECT without an explicit signal.
  - Printed marriage/apostille and passport/MRZ do NOT trigger a second read.

## Identity tuple & hash

Tuple = `family_name`, `given_name`, `patronymic`/`middle_name`, `date_of_birth`,
`place_of_birth`/`place_city` (role-grounded variants `child_*` map onto these).

Normalization for COMPARISON ONLY:
- trim, lowercase, collapse internal whitespace, normalize apostrophes, drop empty/null.
- **Do NOT** apply KMU-55 / dictionary "improvers" before hashing — that could mask a real
  model disagreement. Compare the raw reads.
- If the tuple is too sparse (e.g. < 2 non-empty identity fields) → `hash_status=insufficient_identity_fields` → force review (cannot self-verify).

Hash: deterministic `sha256` of the normalized tuple. Public docs/logs show only a short
hash PREFIX, never the tuple values (no PII).

Behavior:
- hashes DISAGREE → `hard_case_model_instability=true`; force `review_required=true` on ALL
  identity-critical fields; reason `self_consistency_identity_mismatch`.
- hashes AGREE → do NOT lower review; do NOT claim correctness; the class gate may still force
  review for handwritten.
- a run errors/times out → `self_consistency_incomplete=true`; force `review_required=true`;
  do NOT block the upload.

## Runs policy (same vs different model)

- N=2 same model FIRST: 2× cost on allowlist docs only; catches nondeterminism; not an
  independent source, but DISAGREEMENT is a strong instability signal.
- N=3 same model: optional fallback only when N=2 disagree or config requests; costlier.
- Different model: 2×+, different failure mode, not fully independent → LATER, not first impl.
- **Recommendation:** N=2 same model first; N=3 optional; different-model later.

## Cost formula (no guessing)

```
baseline_calls            = 1 per document
self_consistency_calls    = 2 per ALLOWLIST document (N=2)
incremental_calls         = allowlist_traffic_share × 1   (N=2)
incremental_calls (N=3)   = allowlist_traffic_share × 2   (only when escalated)
```
`allowlist_traffic_share` = **UNKNOWN** today (no per-class metric). Needs future logging:
`document_class_count` by product. Do NOT assume a percentage.

## Flags

- `SELF_CONSISTENCY_GATE_ENABLED` (default OFF)
- `SELF_CONSISTENCY_RUNS` (default 2)
- `SELF_CONSISTENCY_MAX_EXTRA_RUNS` (optional, default 1 → escalate to N=3)
- `SELF_CONSISTENCY_TIMEOUT_MS` (optional, per extra read)
- **Dependency:** acts ONLY when `ANTI_FABRICATION_GATE_ENABLED` is ON (no hidden second-read
  behavior when the parent gate is off). If anti-fabrication is OFF → no second reads at all.

## Quality rescan prompt (SEPARATE domain — usability, not anti-fabrication)

- `QUALITY_RESCAN_PROMPT_ENABLED` (default OFF).
- Uses `preprocessImage` `assessment`/`warnings` ONLY for user guidance: too dark / too bright /
  too blurry (if preprocess warns) / oversized-resized (informational).
- Does NOT force identity review, does NOT trigger anti-fabrication, does NOT claim handwriting
  detection.
- UI: after upload/preprocess, before field review. Message (RU): «Фото читается, но качество
  может снизить точность. Лучше переснять при дневном свете / без бликов.»
- Strictly usability/rescan; kept out of the safety path (calibration proved quality ≠ fabrication risk).

## Test plan (no code)

1. flag OFF → current behavior; NO second provider call.
2. printed marriage/apostille → no second read.
3. passport/MRZ → no second read.
4. allowlist handwritten birth + agreeing hashes → no instability flag; review not lowered.
5. allowlist handwritten birth + disagreeing hashes → instability flag + identity review=true + reason.
6. one failed/timeout run → self_consistency_incomplete + identity review=true; upload not blocked.
7. model `confidence_low=false`/`review=false` cannot override a mismatch.
8. values unchanged; no invention.
9. identity hash never exposes PII (prefix only in logs/docs).
10. route coverage: all 4 products still flow through the same readDocument gate.

## Risks

| Risk | Control |
|---|---|
| 2× cost on allowlist docs | scoped to narrow allowlist; flag-gated; N=3 only on escalation |
| Same-model agreement read as correctness | only DISAGREEMENT used; agreement never claims correct |
| Normalizer hides disagreement | compare RAW reads, no KMU/dictionary before hashing |
| Hidden second reads | dependent on ANTI_FABRICATION_GATE_ENABLED; both default OFF |
| Cost guessed without data | allowlist_traffic_share marked UNKNOWN; needs logging first |
| PII in logs | hash prefix only, tuple values never logged |

## Next action

Owner approves the contract + flags (all default OFF). Then a small code step: in `readDocument`,
when `ANTI_FABRICATION_GATE_ENABLED` + `SELF_CONSISTENCY_GATE_ENABLED` and docClass ∈ allowlist,
run readFields N=2, hash identity tuples, force review on mismatch/incomplete. Add the
`document_class_count` metric to learn `allowlist_traffic_share` before judging cost. Quality
rescan prompt is a separate, later usability task.
