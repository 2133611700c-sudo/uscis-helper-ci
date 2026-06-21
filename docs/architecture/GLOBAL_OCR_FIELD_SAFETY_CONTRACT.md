# Global OCR Field Safety Contract

**Date:** 2026-06-06. **Status: DRAFT (binding once adopted).** One safety contract every document flow must
obey — regardless of reader (Gemini / DeepSeek / legacy module / gpt-4o-mini), product (Translation / TPS /
Re-Parole / EAD), or epoch (public wizard / session flow / legacy). Today these diverge (see
P0_OCR_FLOW_INVENTORY + P0_ROOT_CAUSE_ANALYSIS); this contract is the target every path is held to.

## The 10 rules

1. **No critical-identity FINAL value without a trusted source anchor.** A critical field (family_name,
   given_name, patronymic, dob, place_of_birth, sex, passport_number, doc_number, a_number, i94_admission) may
   only be a *final* value if it came from a trusted, in-scope source read at adequate confidence. Otherwise it
   is **candidate-only** or **blank + manual_required**.

2. **Candidate ≠ final — and a low-trust/garbled value is NEVER shown as the field value.** A wrong/garbled
   read (e.g. patronymic truncated to a suffix "<patronymic-suffix-fragment>", a single-token fragment, a label/punctuation) must be
   downgraded to candidate-only / blank+manual. It must NOT appear in the value slot decorated only by a flag.

3. **Hard-case classes are candidate-only/manual unless a human confirms.** Handwritten/Soviet birth certs (and
   any class on the hard-case allowlist) never auto-finalize identity; the human confirms or corrects.

4. **One definition of `review_required` / `manual_required`, shared across ALL paths.** No per-route rule
   (docintel-gate vs DeepSeek-`conf<0.70` vs legacy-module-adhoc). One function decides; all flows call it.

5. **No source_doc_type / source_label mismatch.** The shown source must match the document the value actually
   came from. A birth cert must not produce "Внутр. паспорт" labels; a field's source anchor must be truthful.

6. **No stale-session bleed.** A field from a prior session/upload must never surface as the current document's
   value. Each value carries a source_doc_id / session hash; mismatches are blocked.

7. **Zero recognition is NEVER success.** If a reader returns no usable fields, the result is
   `manual_required` with a clear user message — not a silent "0 results / done".

8. **No silent correction by dictionary/normalizer.** Dictionaries/gazetteer/authority/patronymic resolvers
   may signal a conflict and raise review; they may NOT rewrite a value. Ukrainian source as-written = truth;
   a Russianized output is a model error to flag, not normalize away.

9. **`review_required` / `manual_required` must SURVIVE the whole pipeline** — through adapters, central-brain
   merge, session persistence, UI, and PDF. A downstream layer may raise them, never silently clear them.

10. **PDF / payment / download is BLOCKED while any critical field is unresolved** (review or manual). Final
    output is built ONLY from confirmed values; a candidate/raw value must never reach the PDF. Any
    source→final mismatch is audited.

## Enforcement shape (later P-phase, NOT now)
A single `lib/documentSafety/ocrFieldSafetyGate.ts` that every flow funnels through:
- input: `{ flow, document_class, source_doc_type, field_name, value, source_label, confidence,
  review_required, manual_required, source_doc_id }`
- output: `{ final_value | null, candidate_value | null, review_required, manual_required, reason_codes,
  blocked_for_output }`
- deterministic, pure, no model call, no PII in logs.

## Non-goals (explicit)
Not a model-quality fix (the model still misreads hard-case UA — that's why these go to human review). Not HTR,
not a 2nd provider, not OneBrain-live. This contract is the **containment** that makes wrong reads safe
(candidate/manual/blocked) until the deeper recognition work (gated on GT from different people) is done.

## Adoption order
P0 audit (done) → adopt this contract → P-phase shared `ocrFieldSafetyGate` + regression tests
(P0_OCR_SAFETY_TEST_PLAN) → only then resume D0 prod decision / ReaderResult / OneBrain shadow.
