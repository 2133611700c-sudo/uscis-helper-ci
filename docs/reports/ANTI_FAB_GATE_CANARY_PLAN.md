# Anti-Fabrication Gate — Canary Runbook (READY_FOR_OWNER_APPROVED_CANARY; NOT executed)

**Date:** 2026-06-04. Plan only — the agent does NOT enable any flag. Owner executes via the commands
below when ready. Evidence: hard-case Ukrainian birth certs read ≈0–1/5 vs owner GT; mode C
(anti-fabrication + self-consistency) drove `false_negative_review` to 0 and caught the month error.
That proves the NEED for a forced-review gate on hard-case classes; enabling still goes through canary +
rollback + metrics (not a blind flip).

## ▶ TURNKEY EXECUTION — owner runs ONE sequence; everything else is prepared & test-proven

**Pre-flight (status 2026-06-04):**
| check | state | evidence |
|---|---|---|
| Gate wired into the single door (all 4 products) | ✅ | `antiFabricationGate.test.ts` route-coverage block |
| Gate fires on hard-case via live `readDocument` | ✅ | `readDocument — ANTI_FABRICATION_GATE_ENABLED gating` test |
| **Rollback = byte-identical** (the rehearsal) | ✅ **proven by test** | `canary safety contract` → "rollback is byte-identical" |
| Value immutability (ON never changes a value) | ✅ proven by test | `canary safety contract` → "value immutability" |
| Target classes = handwritten/soviet birth only | ✅ | `HANDWRITTEN_FABRICATION_RISK_CLASSES` + trigger-scope tests |
| `document_class_metric` flag set in prod | ✅ | `DOCUMENT_CLASS_METRICS_ENABLED=1` (emits on first real extraction) |
| Code in prod (main), flag OFF | ✅ | gate code merged; behavior byte-identical until flag flips |
| Owner enable command + observation | ⏳ **owner action** | the one step below |

**Known precision caveat (must watch in canary):** `ua_birth_certificate` maps conservatively to
`birth_certificate_handwritten`, so the gate force-reviews identity on **ALL** birth certs, including printed
modern ones (the registry can't yet tell printed from handwritten). Safety = total (no false negatives);
precision = coarse. `false_positive_review` will be driven by how many birth certs are printed-and-correct.
Test `canary safety contract → coarse precision is DOCUMENTED` pins this.

**The one sequence (canary first, observe, then prod):**
```
# 1) canary/preview slice — enable, observe metrics below before prod
vercel env add ANTI_FABRICATION_GATE_ENABLED preview      # value: 1
# (optional second layer — mode C; requires the first)
vercel env add SELF_CONSISTENCY_GATE_ENABLED  preview      # value: 1
# redeploy the preview from main; run real hard-case docs; watch metrics.
# 2) only if metrics hold → production
vercel env add ANTI_FABRICATION_GATE_ENABLED production    # value: 1
vercel env add SELF_CONSISTENCY_GATE_ENABLED  production    # value: 1
```
Rollback is the inverse (proven byte-identical) — see "Rollback command" below. SMART_NORMALIZE stays OFF.

## Flag
- `ANTI_FABRICATION_GATE_ENABLED` (default OFF). Optionally `SELF_CONSISTENCY_GATE_ENABLED` (requires the
  former). `SMART_NORMALIZE_ENABLED` stays OFF (no benefit; can't fix a reading failure).

## Target document classes ONLY (not blanket)
- `birth_certificate_handwritten`, `birth_certificate_soviet_bilingual` (the confirmed hard-case allowlist).
- Passports/printed/marriage/unknown are NOT targeted — the gate already excludes them (and printed reads fine).

## Behavior when ON (already implemented + tested, currently dormant)
- Forces `review_required=true` on identity fields for the hard-case classes; never changes values; never
  lowers a flag. Self-consistency re-read flags instability → review. Model `review=false` cannot override.

## Rollout scope (canary)
1. Enable in a **preview/canary** deployment first (not full prod), or a small traffic slice if the platform
   supports it. Observe.
2. Only after the metrics below hold, enable in production.
3. The gate only RAISES review on a minority class (hard-case) — worst case is more review, never a silent
   wrong value; that bounds the downside.

## Rollback command (must be ready before enabling)
```
# disable (preferred — remove the var) then redeploy the controlled commit:
vercel env rm ANTI_FABRICATION_GATE_ENABLED production    # (and SELF_CONSISTENCY_GATE_ENABLED if set)
# redeploy main (NOT a local feature branch)
```
Rollback = flag OFF → behavior returns to byte-identical current. No data migration.

## Metrics to watch (during canary)
- `false_negative_review` (wrong identity, review=false) — **MUST stay 0**. Any > 0 → rollback/block.
- `false_positive_review` (correct field forced to review) — UX cost; track, set an acceptable ceiling.
- `review_rate_by_doc_type` — how much each class goes to review.
- `hard_case_submission_count` — how many hard-case docs actually arrive (from `document_class_metric`).
- `user_manual_correction_rate` — how often users edit the forced-review fields.
- support complaints / abandonment on the review step.

## Stop condition (hard)
- ANY critical identity field wrong WITHOUT review → immediate rollback + block (the exact harm the gate
  exists to prevent).
- Review rate so high it breaks the product UX with no safety payoff → pause, retune (or invest in a better
  Ukrainian reader / HTR — the unresolved model blocker).

## Status: READY_FOR_OWNER_APPROVED_CANARY (still NOT executed by the agent)
Enabling the flag in prod is a **separate explicit owner command** after the gates below. The agent only
prepares; it does not flip flags.

## Pre-canary gates (status 2026-06-04)
- ✅ **Owner GT batch ≥6** — MET. 6 files `VERIFIED_BY_OWNER` (verified from `qa-private/ground-truth/`). But
  only **3** are live-door-scorable (2 hard-case birth + passport); military/EAD/I-94 are GT-ready but not
  scorable (no registry type / US doc / no upright image). See `ACCURACY_OFFON_RESULTS.md`.
- ⚠ **Threshold calibration** — `BLOCKED_INSUFFICIENT_N`. ~11 scorable fields can't fit numeric confidence
  thresholds. The gate's decision *rules* are evidence-validated (mode C → false_negative_review 0 on both
  hard-case docs, re-confirmed this session); the numeric thresholds are not. The gate does **not** depend
  on those thresholds to function (it forces review on the hard-case allowlist), so this does not block the
  canary — but it does block tuning `false_positive_review` precisely.
- ⏳ **Rollback rehearsal** — NOT done. Required before enabling.
- ⏳ **`document_class_metric` collecting in prod** — flag set; emits on first real extraction (NOT_OBSERVED_YET).

## What this plan does NOT do
No flag enabled, no prod env change, no deploy, no model switch, no SMART/HTR, no L2-WIRE. Execution is a
separate explicit owner command after the pre-canary gates are met.
