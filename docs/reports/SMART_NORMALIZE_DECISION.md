# SMART_NORMALIZE + hard-case model — decision (from accuracy OFF-vs-ON)

**Date:** 2026-06-04. Evidence: `docs/reports/ACCURACY_OFFON_RESULTS.md` (N=2 docs, one person — SIGNAL not proof).
No prod env changed. No flags enabled. Owner decision required to enable any behavior flag.

## Recommendation 1 — SMART_NORMALIZE_ENABLED → **DO_NOT_ENABLE (now)** / revisit = NEEDS_MORE_DATA

- B-vs-A showed **zero accuracy improvement** on both docs (2.5-flash 0/5=0/5; 3.1-pro 1/4=1/4).
- B introduced a `false_positive_review` on one cell (place normalization flagged a correct field) — a
  small UX cost with no correctness upside on this sample.
- The test docs are Russian-language; the UA gazetteer / KMU dictionaries have little to bite on here, so
  SMART can't help. It may help on Ukrainian-language docs — untested.
- **Decision:** do NOT enable SMART_NORMALIZE in prod on this evidence (no benefit, slight cost). Revisit
  only with more, varied, Ukrainian-language GT. `NEEDS_MORE_DATA` is the path to any future ON.

## Recommendation 2 — hard-case model → **prefer gemini-3.1-pro-preview over 2.5-flash; gate mandatory; NEEDS_MORE_DATA for a firm choice**

- 2.5-flash on hard-case: **0/5 correct (different person), DOB unflagged (FN=5)** without the gate, and
  read DOB month 02 — dangerous.
- 3.1-pro: 1/5 correct and **self-flags DOB** (review=true even in mode A) → FN=2 unaided.
- Neither is trustworthy unaided → **the anti-fabrication + self-consistency gate (mode C) is mandatory
  regardless of model** (it zeroes false-negative review for both).
- Do NOT change the prod default model on N=2/one-person. A firm model choice needs more GT/people.

## The actual high-value lever (separate from SMART)

The accuracy run's strongest result is NOT about SMART — it is that **the anti-fabrication + self-consistency
gate (mode C) eliminated `false_negative_review` (0 in every cell)** and CAUGHT the DOB month error that the
bare model missed. If any flag is worth enabling for safety, it is `ANTI_FABRICATION_GATE_ENABLED`
(+ optionally `SELF_CONSISTENCY_GATE_ENABLED`), NOT `SMART_NORMALIZE_ENABLED`. That is also an owner
decision and still wants more GT for confidence, but the evidence points to the gate, not the dictionaries.

## Owner-gated next steps (in OWNER_QUEUE)
1. Clarify GT language intent (as-written RU vs canonical UA) — changes per-field accuracy interpretation.
2. Provide more/varied GT (different people, Ukrainian-language docs) before any prod flag decision.
3. SMART_NORMALIZE: keep OFF. anti-fabrication/self-consistency: owner decision (evidence-supported) but
   gather more GT first.

## Exact commands (DO NOT run — owner only, only if/when authorized)
```
# SMART_NORMALIZE — NOT recommended now:
# (left intentionally not provided as a ready command — see Recommendation 1)
# If owner later chooses to canary the SAFETY gate (evidence-supported), the flag is:
#   vercel env add ANTI_FABRICATION_GATE_ENABLED production   (value: 1)  + redeploy
```
