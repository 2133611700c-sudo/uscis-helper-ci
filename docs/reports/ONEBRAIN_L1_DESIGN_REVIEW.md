# OneBrain L1 — Design Review (decideField contract)

**Date:** 2026-06-04  **Type:** design review, docs-only. Contract:
`docs/architecture/ONEBRAIN_DECIDE_FIELD_CONTRACT.md`.

## What L1 delivers
A single per-field decision contract `decideField(input) → FieldDecision` that makes OneBrain the ONE
field-decision center: readers, quality, dictionaries (as signals), validators, self-consistency, and
strong anchors flow IN; one decision (accept / accept_low_confidence / force_review / reject) + provenance
+ audit hash flow OUT. Pure/deterministic; no I/O inside.

## How it maps onto what already exists (so L2 is consolidation, not rewrite)

| Contract piece | Existing live code it formalizes |
|---|---|
| `reads[]` input | `readDocument` → `read.fields[]` (VisionFieldRead) |
| arbitration / decision | `arbitrateDocument` (today's nascent decider) |
| `dictionary_signals` | dictionaryBridge snapCity / KMU-55 / patronymic / authority (behind SMART, OFF) |
| `self_consistency` | `selfConsistency.ts` (gate, OFF) |
| critical-field force-review | `antiFabricationGate.ts` (gate, OFF) |
| `quality` | `image-preprocess.ts` (not yet threaded into reader) |
| `audit_hash` | new (provenance chain) |

→ L2 = wrap these into `decideField`, not build from scratch. consensus.ts stays dormant (not removed).

## Rule rationale (tied to evidence)
- **Dictionary = signal, not rewrite:** the accuracy run + the DOB month case show a silent dictionary
  rewrite would replace model-fabrication with dictionary-fabrication. Contract forbids it (rule 1).
- **Critical stricter + self-consistency forces review:** accuracy mode C drove false_negative_review to 0
  by forcing review on critical identity under instability — rules 2 & 3 encode exactly that.
- **candidate_not_verified excluded:** matches the owner GT scope (only 6 verified fields penalized).
- **No PII in artifacts:** value/normalized_value are PII; only ids/flags/reasons/hash leave the boundary.

## Risks / open questions (honest)
- **GT-language intent** (RU as-written vs UA canonical) still unresolved — affects how `validation_signals`
  / accuracy interpret a "mismatch". Owner-gated (L3).
- **Confidence calibration:** thresholds per criticality are not yet numerically set — needs the L3 GT batch;
  L1 fixes the SHAPE, not the numbers.
- **Multi-reader consensus** is designed as an input slot only (`reads[]` with N readers) — not built; L4.
- **Backward-compat:** L2 must keep flags default OFF so prod behavior is byte-identical until owner canary.

## Verdict
L1 contract is **complete in shape** and consistent with the proven evidence + the OneBrain target. It does
not change runtime. Numbers (thresholds) and the second reader are deferred (L3/L4). Ready for owner review.

## Next (owner-gated)
- **L2:** implement `decideField()` behind flags (default OFF); route the proven gate through it; prod unchanged.
- **L3:** expand GT (different people + Ukrainian-language) + resolve GT-language intent → calibrate thresholds.
- **L4:** second independent reader (true consensus) / HTR / model switch — only if metrics justify.
