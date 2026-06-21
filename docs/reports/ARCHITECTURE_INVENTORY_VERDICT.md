# Architecture Inventory Verdict — current truth vs target (OneBrain)

**Date:** 2026-06-04
**STATUS:** PASS_AS_TRUTH_INVENTORY / DEGRADED_AS_TARGET_ARCHITECTURE.
The factual inventory is correct; "1 reader + gate" is the current LIVE state and the next safe
step — it is NOT the final architecture. Target = a single live decision center (OneBrain).

## 1. Current live truth (raw-verified)

- `engine/consensus.ts` **exists (16/16 unit tests) but is DORMANT** — no `/api` route calls it.
  Its only path is `central-brain`, gated in `translation/vision-extract/route.ts:159` by
  `CENTRAL_BRAIN_TRANSLATION==='on' && ONE_BRAIN_CORE_ENABLED!=='1'`; prod has `ONE_BRAIN_CORE_ENABLED=1`,
  so the consensus branch is always skipped. **consensus.ts is NOT a live brain.**
- **HTR is NOT live.** `engine/htr.ts` itself documents: no transcript ever produced; Transkribus
  account is Google-OAuth federated (no password) → processing token cannot be minted → 401.
- **Live path = ONE Gemini read (`docintel/readDocument`) → `arbitrateDocument` → gates.** The
  multi-reader "3 readers cross-check via brain" of the org-chart does not run in prod.
- Accuracy (2026-06-04, owner GT, N=2/one-person, RU-doc-vs-UA-GT caveat): the single reader is
  unreliable on hard-case (0–1/5 vs GT); the anti-fabrication + self-consistency gate (mode C) drives
  `false_negative_review` to 0 in all cells and catches the DOB month error the bare model misses.
  → The chart's premise ("don't trust one reader") is empirically validated; the current realization
  is a safety wrapper, not the full brain.

## 2. Target architecture — OneBrain / DocumentBrain (the only field-decision center)

```
/api/*-extract
   └─ readDocument()
        └─ DocumentBrain (the ONE decision center)
             D0 quality / preprocess (signal, not just buffer)
             D1 readers   — Gemini now; optional 2nd independent reader later; HTR later IF metrics justify
             D2 dictionaries / gazetteer / KMU-55 / patronymic — give a SIGNAL, never silently rewrite
             D3 normalization
             D4 validators
             D5 anti-fabrication + self-consistency
             D6 final field decision: accept | accept_with_low_confidence | force_review | reject
        └─ UI / PDF / human review
```

Per-field decision schema (the contract OneBrain must emit):
```json
{
  "value": "...",
  "confidence": 0.72,
  "source": "gemini",
  "normalized_value": "...",
  "dictionary_match": false,
  "validation_status": "valid",
  "review_required": true,
  "review_reason": "self_consistency_mismatch"
}
```

Rules:
- Dictionaries are a **signal**, never a silent rewrite. If the model read month "липня" and GT is
  "червня", the dictionary must NOT change the month — it raises `dictionary_match=false` /
  `review_required` with a reason. A silent dictionary rewrite would create a NEW fabrication source
  (dictionary instead of model).
- **No separate dead consensus branch.** `consensus.ts`/`central-brain` must either be folded into
  OneBrain or removed — not kept as a parallel dormant stack (Session-103 debt).
- "Real consensus" = **different independent readers** disagreeing (Gemini vs GPT-4o, field-level
  identity-hash), NOT 3× the same model. Self-consistency (same-model re-read) is an instability
  detector, a stepping stone — not consensus.

## 3. Decisions (evidence-based; all owner-gated to flip)

- `SMART_NORMALIZE_ENABLED`: **DO_NOT_ENABLE now** (accuracy showed zero gain + a false-positive review).
- HTR: **DO_NOT_BUILD now** (auth blocked + PII egress for immigration docs + unproven ROI at N=2).
- Model switch: **DO_NOT_SWITCH now** (3.1-pro safer than 2.5-flash but N too small; gate mandatory regardless).
- Anti-fabrication / self-consistency gate: **PREPARE_CANARY only** — no prod enable without owner
  approval AND a rollback (flag OFF). It is the proven safety lever, but enabling waits on more GT.

## 4. Next priorities

- **L0 — fix the truth (this doc):** record current live state + target OneBrain; consensus.ts is NOT
  a live brain until a route calls it. STATUS/HANDOFF updated.
- **L1 — design the OneBrain contract:** the `decideField()` field-decision schema above; make the
  proven gate a PART of OneBrain, not an external patch. Design first (no behavior change).
- **L2 — integrate the proven gate into OneBrain behind flags** (still default OFF; PREPARE_CANARY).
- **L3 — expand GT** (different people, Ukrainian-language docs; resolve GT-language intent) and rerun accuracy.
- **L4 — later, only if metrics justify:** second independent reader (true consensus) / HTR / model switch.

## 5. Restrictions honored by this verdict

docs-only; no prod env; no flags enabled; no deploy; no model change; no PII in docs/reports; raw stays
in `qa-private/` (gitignored).

## Bottom line
Accept the inventory as TRUTH. Do NOT accept "1 reader + gate" as the destination. Build toward ONE
live DocumentBrain — readers, dictionaries (as signal), validators, anti-fabrication, self-consistency,
quality, and one audit trail inside a single field-decision center; real multi-reader consensus and HTR
arrive later, gated on data, not aesthetics.
