# OneBrain — `decideField()` Contract (DESIGN ONLY, not yet implemented)

**Date:** 2026-06-04  **Status:** design. No runtime behavior, no code, no flags. This is the
single field-decision contract OneBrain/DocumentBrain will expose. It consolidates the live pieces
(`readDocument` reader + `arbitrateDocument` + the anti-fabrication / self-consistency gates + the
D2 dictionaries) into ONE explicit per-field decision. Dictionaries give SIGNALS, never silent
rewrites. Real multi-reader consensus and HTR are future inputs, gated on data — not part of L1.

> Scope note: `arbitrateDocument` is today's nascent decision center; `decideField()` formalizes and
> supersedes it. consensus.ts is NOT removed (per constraints) — it stays dormant until either folded
> in or retired in a later step.

## 1. Signature

```
decideField(input: FieldDecisionInput): FieldDecision
```
Pure, deterministic given its inputs. No I/O inside `decideField` — readers/dictionaries/validators
run upstream and pass their outputs in as SIGNALS. (Self-consistency re-reads are produced upstream
by the reader layer and handed in as `self_consistency`.)

## 2. Input — `FieldDecisionInput`

```jsonc
{
  "field_id": "child_family_name",          // canonical field key
  "criticality": "critical",                // critical | high | low  (identity fields = critical)
  "reads": [                                // raw reader outputs (1..N independent reads)
    { "reader": "gemini", "model": "gemini-2.5-flash", "run": 1,
      "raw": "<cyr-surname>", "iso_date": null, "confidence": 0.93, "can_read": true }
    // future: { "reader": "gpt4o", ... }, { "reader": "htr", ... }
  ],
  "quality": {                              // D0 preprocess signals (optional)
    "assessment": "good", "blur_score": 36.4, "rotated_applied": false, "low_quality_scan": false
  },
  "dictionary_signals": [                   // D2 — SIGNAL ONLY (never an applied value)
    { "kind": "gazetteer", "matched": false, "suggested_value": "…", "review_required": true,
      "reason": "fuzzy/unknown city" },
    { "kind": "kmu55", "normalized_value": "<lat-surname>", "matched": true },
    { "kind": "patronymic", "well_formed": true, "review_required": false },
    { "kind": "authority_registry", "matched": false }
  ],
  "validation_signals": [                   // D4 validators
    { "rule": "iso_date", "status": "valid|invalid|na", "detail": "…" },
    { "rule": "calendar_date", "status": "valid" }
  ],
  "self_consistency": {                     // D5 instability detector (same-model N reads, or multi-reader)
    "status": "agree | mismatch | incomplete | insufficient_identity_fields | not_run",
    "instability": false, "identity_hash_prefix": "6111ed39c15a", "runs": 3
  },
  "strong_anchor": {                        // optional authoritative source
    "kind": "mrz | i94 | ead | i797 | none", "present": false, "value": null, "valid": false
  },
  "eval_context": {                         // OPTIONAL — only for offline accuracy runs, never in prod
    "gt_present": false, "owner_verified_field": false, "verified_scope": [],
    "candidate_not_verified": false        // if true → excluded from accuracy penalties
  }
}
```
No raw PII is logged/serialized into public artifacts; only field ids, flags, reasons, and hash
prefixes leave the boundary.

## 3. Output — `FieldDecision`

```jsonc
{
  "field_id": "child_family_name",
  "value": "<cyr-surname>",                      // chosen RAW reader value (or strong-anchor value)
  "normalized_value": "<lat-surname>",           // D2/D3 normalized (KMU/ISO) — separate from value
  "confidence": 0.62,                       // final, ≤ min(applicable layer confidences)
  "decision": "force_review",               // accept | accept_low_confidence | force_review | reject
  "review_required": true,
  "review_reasons": ["self_consistency_identity_mismatch", "critical_no_strong_anchor"],
  "source_trace": [                         // provenance: who produced what
    { "reader": "gemini", "model": "gemini-2.5-flash", "run": 1, "used_for": "value" },
    { "layer": "kmu55", "used_for": "normalized_value" }
  ],
  "dictionary_signals": [ /* echoed from input, for audit */ ],
  "validation_signals": [ /* echoed from input */ ],
  "safety_flags": ["hard_case_model_instability"],
  "audit_hash": "sha256(field_id|value|normalized|decision|reasons|source_trace)"  // chain-able
}
```

### Decision enum
- **accept** — value trustworthy: confidence ≥ threshold(criticality), no blocking signal, no instability,
  validators valid (or strong-anchor present & valid). `review_required=false`.
- **accept_low_confidence** — usable but below the auto-final bar: surfaced to the user pre-checked but
  flagged; `review_required=true` with a soft reason. (Never for `critical` without a strong anchor.)
- **force_review** — value kept (never blanked) but MUST be human-confirmed. `review_required=true`.
- **reject** — no trustworthy source (no read / garbage / blocked) → emit no auto-value; `review_required=true`,
  reason `no_source`.

## 4. Rules (binding)

1. **Dictionaries never silently overwrite `value`.** D2 output goes to `dictionary_signals` and may set
   `normalized_value` (a SEPARATE field) and/or raise `review_required` — it must NOT replace `value`.
   Example: model read month "липня" while truth is "червня" → the dictionary may flag
   `review_required` + reason `month_token_mismatch`, but it must NOT rewrite the month. A silent rewrite
   would be dictionary-fabrication.
2. **Critical identity fields use stricter thresholds.** `criticality:'critical'` (family/given/patronymic/
   dob/place_of_birth/issuing_authority-when-identity) → higher accept threshold; **never `accept` without
   a strong anchor when any instability or validator-invalid or dictionary-review signal is present** →
   downgrade to `force_review`.
3. **Self-consistency mismatch on DOB / name / place forces review.** `self_consistency.status` ∈
   {mismatch, incomplete, insufficient_identity_fields} on a critical identity field ⇒ `decision=force_review`,
   `safety_flags += hard_case_model_instability`, reason `self_consistency_identity_mismatch`. Model
   self-reported `review=false`/`confidence_low=false` CANNOT override this on hard-case.
4. **`candidate_not_verified` excluded from accuracy penalties.** When `eval_context.candidate_not_verified`
   is true, the field is scored as N/A in offline accuracy (never counted wrong / false-negative). Only
   `owner_verified_field` fields within `verified_scope` are penalized.
5. **No raw PII in docs/reports.** `value`/`normalized_value` are PII at runtime; public artifacts and logs
   carry only field ids, decisions, reasons, signal kinds, and `audit_hash` prefixes. Raw → qa-private.
6. **Strong anchor precedence.** A valid `strong_anchor` (e.g. MRZ for passport) controls the anchored
   field and suppresses the blanket hard-case force on THAT field only. Birth certs have no anchor → hard-case
   identity defaults to force_review.
7. **Never lower a review flag; never blank a value.** Layers may only raise review and add reasons; the
   raw read value is preserved as evidence even on reject/force_review.

## 5. Audit trail
Each `FieldDecision.audit_hash` chains `source_trace` + decision + reasons → a per-field provenance record
("who read what, where the value came from, why review"). This is the single audit the Auditor role checks.
Document-level result = ordered list of FieldDecisions + a document audit_hash over them.

## 6. What L1 does NOT do
No implementation, no wiring, no flags, no model/HTR/consensus change. L2 will implement `decideField()`
behind flags (default OFF) and route the proven gate through it; L3 expands GT; L4 adds a second
independent reader (true consensus) / HTR if metrics justify.
