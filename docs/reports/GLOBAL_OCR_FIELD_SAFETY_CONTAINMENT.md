# Global OCR Field Safety — Containment (guard implemented + tested)

**Date:** 2026-06-06. Containment for the P0 incident (PR #94 audit). This delivers the **shared safety guard**
that decides whether an OCR-derived field may be a FINAL value — the single source of truth across all 6 reader
paths. No prod behavior change yet (guard is pure + not yet wired → byte-identical). No flag enabled.

## Incident → containment (from PR #94)
- RC-1 translator birth `auto:false` → 0 results; RC-2 wrong/garbled value shown AS the value (candidate≠final
  not enforced); RC-3 six paths / four safety regimes; RC-4 TPS multi-doc; RC-5 core→legacy fallback ungated.
- Fix = one guard every path funnels through, enforcing the GLOBAL_OCR_FIELD_SAFETY_CONTRACT (10 rules).

## What was built (this PR)
- `apps/web/src/lib/documentSafety/ocrFieldSafetyGate.ts` — `protectOcrField(input) → output`:
  - **PII-free by construction**: input carries `value_present` booleans, NOT the value → the guard cannot see,
    leak, or alter content (contract rule 8). Output is metadata only (final/candidate/review/manual/block).
  - decisions: `accept_final | candidate_only | manual_required | block`.
  - precedence (critical fields): block > manual_required > candidate_only > accept_final.
  - rules enforced: zero recognition→block/manual; source/`expected` mismatch→not final; hard-case birth
    cert→candidate/manual; legacy reader (no strong anchor)→candidate/manual; no strong anchor→candidate/manual;
    low confidence (<0.70, unifying the divergent per-path thresholds)→not final; stale session
    (`source_doc_id≠session_doc_id`)→blocked; admin+safe→accept_final.
  - `review_required`/`manual_required` only INCREASE (rule 9); guard never changes value (rule 8).
- `hasUnresolvedCriticalForOutput(fields)` — shared PDF/payment/download gate (rule 10): blocks output while any
  critical field is review/manual and not confirmed; admin/optional never block.

## Evidence
- `tsc --noEmit`: **0 errors**.
- Guard tests: **18 passed** (`ocrFieldSafetyGate.test.ts`) — every contract rule, incl. no-PII output assertion.
- Full web suite: **2893 passed / 4 skipped** (was 2875 + 18) → guard is pure/unwired = **no regression, prod byte-identical**.

## NOT done yet (next increment C3 — wiring, behind a flag default OFF)
The guard exists and is proven, but is **not yet called by any product flow** (so prod is unchanged). Wiring is
the next step, one flow at a time, behind `OCR_FIELD_SAFETY_ENABLED` (default OFF → byte-identical), with a test
per wire:
1. **Translation public** — zero-recognition / `auto:false` → explicit `manual_required` critical state (not silent "0 results"); block PDF/payment.
2. **TPS merge plane** — every OCR-derived critical field through the guard before it becomes final; truthful source label (no internal-passport label on birth-cert fields).
3. **Legacy `/api/ocr/extract` boundary** — `legacy_reader=true` → critical fields candidate-only/manual.
4. **PDF/payment** (`generate-pdf` / `render` / `tps/generate-packet`) — reuse `hasUnresolvedCriticalForOutput`.

## Guardrails honored
No prod env/flag change; no model/provider change; no HTR/GPT/OneBrain/ReaderResult/SMART; no PII; qa-private=0.

## Acceptance status
Containment **foundation = PASS** (guard + contract enforced in code, fully tested, zero regression). Full
containment is PASS only after C3 wiring + per-flow tests prove: wrong critical value can't be final; zero
recognition isn't success; source mismatch blocked; candidate≠final; review/manual survive merge/UI/PDF;
PDF/payment block unresolved critical. D0 prod / ReaderResult / OneBrain stay HELD until then.

## Next action
Wire the guard into the 4 flows behind `OCR_FIELD_SAFETY_ENABLED` (default OFF), one PR-able increment per flow,
RED test → wire → GREEN, full suite green each step.
