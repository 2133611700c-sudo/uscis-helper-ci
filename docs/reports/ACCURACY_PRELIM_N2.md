# Accuracy — PRELIMINARY SIGNAL ONLY (N=2)

**Date:** 2026-06-04  **Label:** PRELIMINARY_SIGNAL_ONLY — NOT calibration, NOT a production decision.
**N=2** (birth_cert_soviet + birth_cert_handwritten — the same pair already scored; **0 new GT categories**).
Owner-authorized partial rerun. Scored `value` = as-written vs read raw layer; only `owner_verified_fields`;
`candidate_not_verified` = N/A. Raw → `qa-private/reports/accuracy-offon/prelim/` (gitignored). No PII here.

## Result (both docs, both models)
| mode | FN_review (wrong+review=false) | FP_review (correct+review=true) | DOB month |
|---|---|---|---|
| A (all OFF) | 12 | 1 | MISMATCH, MISSED on 2.5-flash / caught on 3.1-pro |
| B (SMART) | 14 | 0 | same (SMART no help) |
| C (anti-fab + self-consistency, N=3) | **0** | 2 | **CAUGHT (all cells)** |

- Mode C: `false_negative_review = 0` in all 4 cells; DOB month-mismatch caught; self_consistency =
  agree (2.5-flash this run; mismatch earlier — nondeterministic) / mismatch (3.1-pro).
- SMART (B vs A): no accuracy gain (consistent with prior N=2).
- 2.5-flash reads a different person (0/5); 3.1-pro 1/5; both unreliable unaided.

## Consistency with prior N=2
Reproduces the earlier run (ACCURACY_OFFON_RESULTS.md). **Adds no new ground-truth data.**

## Decisions (UNCHANGED — this is signal, not proof)
- calibration_status: **BLOCKED** (needs N≥6).
- l2_wire_status: **BLOCKED**.
- smart_decision: **DO_NOT_ENABLE** (no gain) / NEEDS_MORE_DATA to revisit.
- gate_decision: **BLOCKED_NEEDS_GT_BATCH** (signal is positive — C zeroes FN — but N=2 can't authorize wiring).
- model_decision: **NEEDS_MORE_DATA** (3.1-pro safer on this pair; not enough to switch).
- next: fill +4 new VERIFIED GT files → real calibration.
