# NEXT SESSION — L0 `certifier_override` KICKOFF (paste this as the first message)

> Copy everything inside the fenced block below into the new session's first message to the agent.

```
TASK: Build the L0 certifier_override authorization primitive. TDD. One PR.

ANTI-DRIFT (read first): The constitution and ADR-021 are RULED. Do NOT interpret,
do NOT extend, do NOT "improve" the rulings. If you hit an ambiguity not answered
by these docs — STOP and ask the owner. Do not guess. Synthetic example names only
(Іваненко / Иваненко / Ivanenko); NEVER real PII in code/tests/logs/docs.

LOCKED DOCS (read before writing any code; both at commit 46efb8b):
- docs/architecture/ONE_BRAIN_CYRILLIC_CONSTITUTION.md  (8 LAWS + L0–L4 map; LAW 2#5 tiered authority)
- docs/adr/ADR-021-delegated-certifier.md  (RULED v1: Q1 3-tier, Q2 6-code ENUM, Q3 parents, matrix, audit hook)

WRITE THIS TEST FIRST (TDD anchor — the most important Q2 constraint):
  certifier_override_rejects_user_clarified_reason_for_TIER_1_field
  (user_clarified is TIER 3 only; using it on a TIER 1 field must be rejected at the override entry point)

L0 PR SCOPE (only this):
  1. certifier_override path in C3 (the only way a TIER 1/TIER 2 critical field finalizes from human input).
  2. criticality matrix (field, document_class) → tier {1|2|3}, REPLACING the substring classifyCriticality
     at apps/web/src/lib/documentSafety/applyOcrFieldSafety.ts:48-51.
  3. tier × reason_code validity matrix (ADR-021 ADDITION A), enforced — reject out-of-matrix (code, tier) pairs.
  4. DeepSeek lint rule (CHECKABLE test/lint, not a comment): DeepSeek output can never reach final_value.
  5. Audit hook writing ALL 9 fields (reason_code, tier, field_name, document_class, previous_value, new_value,
     certifier_id, timestamp_utc, session_id, linked_pdf_doc_id, cross_doc_anchor_id, immutable_marker) to a log
     file destination (ADR-019 persistence is OUT of scope — log file is fine for now).
     [Note: that is the full ADR-021 schema; "9 fields" in shorthand — include every field ADR-021 lists.]

OUT OF SCOPE for this PR (do NOT touch — explicitly):
  - L1 (refund, rate-alert, handwriting counter)
  - Gazetteer history (separate next window, as a TIER-1 place_of_birth risk reducer — NOT here)
  - ADR-019 persistence code
  - ADR-020 / HTR
  - Any D5 / review UI changes

DEFINITION OF DONE:
  - All matrix tests green (3 tiers × 6 reason codes × per-doc-class × anchor-conflict-block × out-of-matrix-reject).
  - applyOcrFieldSafety.ts:48-51 substring path removed or marked deprecated (matrix is the single source of truth).
  - Audit hook writes every ADR-021 field to a log file.
  - DeepSeek lint FAILS on a "bad" fixture (an attempt to write DeepSeek output into final_value directly).
  - tsc 0, content-guard 0, full vitest suite green.
  - STATUS.md / HANDOFF.md / CHANGELOG.md updated with test evidence.

ANCHOR RULE (LAW 2#5): a cross-document anchor (MRZ/EAD) ALWAYS overrides user_confirmed on critical identity;
a user_confirmed ↔ anchor conflict → block + escalate, never override.
```

## Sequence after L0 merges (do NOT bundle into the L0 PR)
1. **L0** certifier_override (this kickoff) → review → merge.
2. **Gazetteer history** (next window) — pre-2020 names + renames map, as a TIER-1 `place_of_birth` friction reducer.
3. **L1** — refund policy + guard-block rate alert + (handwritten-origin classifier → `visual_evidence_score` → window counter).
4. **ADR-019** audit persistence (minimal) — parallel to L1, non-blocking.
5. **ADR-020** HTR data-handling — before any HTR.
6. **HTR** — only when the 6-condition threshold (constitution) is met.
