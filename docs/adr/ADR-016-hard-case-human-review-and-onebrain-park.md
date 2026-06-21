# ADR-016 — Hard-case Ukrainian = mandatory human review; OneBrain decideField parked; N=1 honesty

**Status:** Accepted (2026-06-04)
**Context owner:** Taras. Supersedes nothing; complements ADR-CENTRAL-BRAIN, the One-Brain decision.

## Context

Measured against owner ground truth (gemini-3.1-pro, the best available reader):
- Hard-case Ukrainian (handwritten / Soviet bilingual birth certs): **1/4 identity fields correct**. The
  model returns a plausible-but-wrong identity and self-reports `review_required=false` — the most dangerous
  failure mode. Russianization of Ukrainian names/patronymics is a real reading error, not normalization.
- Printed UA (internal passport, military ID identity page): reads well in the few samples we have
  (passport 3/3 read fields, military 5/5) — but every number to date is **one person / a handful of docs**.

Two temptations to reject: (a) "measure the hard-case model more and then decide" — it will not improve by
being measured; (b) "treat printed N=1 results as if the class works" — one card read correctly is not a
class verdict.

## Decision

1. **Hard-case Ukrainian birth certs are a HUMAN-REVIEW class by policy, not by metric.** The model is not
   trusted unaided for identity on `birth_certificate_handwritten` / `birth_certificate_soviet_bilingual`.
   Enforcement = the anti-fabrication gate (force `review_required` on identity) + optional self-consistency.
   This is a product rule; we stop gating it on "more accuracy data."

2. **No production threshold/model decision may be made from single-person GT.** Any numeric accuracy claim
   that would flip a flag, switch a model, or set a confidence threshold is FROZEN until GT spans genuinely
   different people. Current evidence is "directional signal," never a prod-grade verdict. Reports must say so.

3. **OneBrain `decideField` is PARKED** (header notice added). It has 0 live callers; the working safety
   architecture is already `reader → arbitrate → gate(review)`. Its numeric thresholds are placeholders and
   cannot be calibrated at current N. Revisit only when GT ≥ ~50 fields across different people. Not deleted;
   kept as a design reference. No L2-WIRE.

4. **EAD / I-94 are NOT a UA-OCR scoring target** (see the coverage report). They are English/Latin documents
   the client already holds; the controlling-Latin rule reads their MRZ/printed Latin directly. They belong
   to a separate, simpler Latin path — not the Ukrainian reader brain. "Make EAD/I-94 scorable through the UA
   door" was the wrong goal and is withdrawn; their raw API reads are not product accuracy.

## Consequences

- The anti-fabrication gate becomes the canonical safety mechanism for hard-case identity. Its rollout is a
  canary (see `docs/reports/ANTI_FAB_GATE_CANARY_PLAN.md`), gated on an owner command + a rehearsed rollback
  (now proven byte-identical by an automated test).
- We invest in **breadth of GT (more people)**, not in squeezing the hard-case model or in HTR/model swaps.
- decideField/OneBrain stop appearing as near-term work; STATUS reflects PARKED.
- The EAD/I-94 "coverage blocker" is dissolved: it was a category error, not a missing fixture.

## What this ADR does NOT do

No flag enabled, no prod env change, no deploy, no model switch, no SMART/HTR, no L2-WIRE, no GT fabrication,
no PII history rewrite. All of those remain explicit, separate owner decisions.
