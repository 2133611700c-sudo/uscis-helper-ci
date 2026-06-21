# P0 — OCR Safety Test Plan (regression tests for the Global Field Safety Contract)

**Date:** 2026-06-06. Tests that must exist + pass BEFORE any containment fix is trusted and before resuming
D0/ReaderResult/OneBrain. No PII fixtures (synthetic only). These encode the 10 contract rules as executable checks.

## A. Reader-path consistency
1. The SAME garbled patronymic ("ович"/suffix-only/"<patronymic-suffix-fragment>") → identical verdict (candidate-only/manual) on
   ALL paths: docintel, TPS-core, TPS-legacy-module, translation-session(DeepSeek), translation-public.
2. `review_required` produced by any path maps to the ONE shared definition (no `conf<0.70`-only divergence).

## B. Candidate ≠ final (RC-2)
3. A truncated patronymic (`< N` chars or suffix-only) is returned as **candidate-only / blank+manual**, NOT as
   the field value.
4. A field value that is a label/punctuation/garbage is downgraded to blank+manual (garbageGuard, globally).
5. A confirmed value differs from the raw candidate → audit event recorded; PDF uses the confirmed value only.

## C. Zero recognition (RC-1, rule 7)
6. Translator on a birth cert: result is **manual_required with a clear message**, never silent "0 results".
7. A reader returning 0 usable fields → `manual_required`, never `status: ok / done`.

## D. Source integrity (rules 5, 6)
8. A birth cert cannot produce `source_doc_type = internal_passport` labels (no cross-doc label bleed).
9. A value from a previous session/upload cannot appear as the current document's field (stale-session block).

## E. Hard-case policy (rule 3)
10. Handwritten/Soviet birth-cert identity fields are candidate-only/manual unless human-confirmed (consistent
    with ADR-016), on every flow that can ingest them.

## F. Survival through pipeline (rule 9)
11. An adapter / central-brain merge / session persist / render cannot CLEAR `review_required` or `manual_required`.
12. The UI cannot present a `review_required` field as accepted/clean.

## G. Output gate (rule 10)
13. `generate-pdf` (public), `render` (session), `tps/generate-packet` ALL block while any critical field is
    unresolved (review/manual). Admin/non-critical fields may pass if safe.
14. Payment/checkout cannot complete into a state that yields a PDF with unresolved critical fields.

## H. Multi-doc UX (RC-4)
15. TPS fields whose source document was not uploaded show `manual_required` + "upload <document>" guidance,
    not a bare blank that reads as failure. (UX assertion; can be a copy/string test.)

## I. Guardrails
16. No PII in any structured result/log (assert no Cyrillic values / dates / doc-numbers in safety output).
17. Dictionaries/normalizers never rewrite a value (signal/review only).

## Pass criteria (the bar)
- A wrong critical value can NEVER appear as an accepted final value.
- Zero recognition can NEVER appear as success.
- Source mismatch / stale bleed is blocked.
- A candidate never becomes final without explicit human confirmation.
- Every output gate (PDF/packet/payment) blocks on unresolved critical fields.

## Sequencing
These tests are written ALONGSIDE the shared `ocrFieldSafetyGate` (next P-phase), starting RED (proving the
current gaps), then GREEN after containment. No containment code lands without these. D0 prod / ReaderResult /
OneBrain stay frozen until this suite is green.
