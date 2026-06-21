# GT BENCHMARK EXIT CRITERIA (P0 design lock)

Date: 2026-06-10
Status: LOCKED v1 thresholds (owner may tighten). Runner = pending (Agent B blocked on spend limit).
Backs: the OCR_FIELD_SAFETY / hard-case canary decision. No canary without meeting these.

## Purpose

Stop deciding model/pipeline quality by feel. A canary (enabling a safety flag or
hard-case autoread in prod) is approved ONLY against pre-agreed numbers on
owner-verified ground truth — not a pretty average.

## Sample-size tiers (honesty about confidence)

- **< 30 docs/class** → result is **exploratory only**. NOT canary approval.
- **≥ 30 docs/class** → Tier 1 "decision benchmark" — sufficient to make a rollout decision.
- **≥ 100 docs/major-class** → Tier 2 "serious benchmark" — target state.

Current reality: we have ~1 owner document per class (`qa-private/ground-truth/`).
That is exploratory only. Today's runs measure *regression direction*, not
canary-readiness. State this in every report.

> **BINDING ON THE RUNNER (not just this doc):** the `< 30 docs/class →
> EXPLORATORY ONLY` rule MUST be enforced in the benchmark runner CODE, not only
> here in markdown. The runner must compute per-class N and stamp the verdict
> `EXPLORATORY` (never `PASS`/`canary-approved`) whenever N < 30. Otherwise someone
> issues a PASS verdict on N=22 in three months. A markdown rule no one runs is
> not a control.

## Per-class accuracy thresholds (critical fields, from CRITICAL_FIELDS_CONTRACT.md)

| Class | Min per-critical-field accuracy | Extra rule |
|---|---|---|
| Passport / booklet | ≥ 99% | controlling Latin (MRZ) must win |
| Military booklet | ≥ 98% | — |
| Birth / marriage (hard-case) | ≥ 97% **OR** every uncertain field is `review_required` | no silent wrong critical |
| Soviet bilingual | ≥ 97% | zero forced rewrite of as-written RU/UA names |

## Global hard rules (never waived, any sample size)

1. **0 silent fabricated identity fields.** A wrong confident critical read with `review_required=false` is an automatic FAIL.
2. **0 PDF output from a critical field without `finalValue`.**
3. Fallback-model read of a non-Latin doc must be `review_required` (ADR-018) — verified structurally, not just statistically.

## Metrics the runner must emit (sanitized, no PII)

Per class and overall: per-critical-field exact-match %, review-flagged %,
0-field %, fallback-model %, timeout %. Raw values (with PII) → `qa-private/` only.
Sanitized summary (counts/percent only) → committable.

## Canary exit gate

Canary (`OCR_FIELD_SAFETY_ENABLED=1` or hard-case autoread) is approved when, on a
Tier-1+ sample:
- all per-class thresholds met, AND
- all global hard rules pass, AND
- owner signs off on the sanitized report.

Until Agent B's runner exists and a Tier-1 sample is collected, the canary stays
**owner-blocked**. This session's single-doc bench is direction-only.

## [OWNER DECISION]

- Whether 1-doc-per-class exploratory runs are worth the paid-key spend now, or
  wait until more owner GT docs exist.
- Source of additional GT docs (different real people — required to detect
  wrong-person fabrication, which a single owner's docs cannot).
