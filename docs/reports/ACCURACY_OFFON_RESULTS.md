# Accuracy OFF-vs-ON — Results (sanitized; counts/verdicts only, no PII values)

**Date:** 2026-06-04  **Local only, prod untouched.** Raw (PII) → `qa-private/reports/accuracy-offon/` (gitignored).
**GT:** owner-VERIFIED, scored ONLY the 6 `owner_verified_fields` (family/given/patronymic cyrillic,
date_of_birth, place_of_birth_raw, sex). `sex` is N/A on birth certs (spec emits no sex field) → not penalized.
candidate-not-verified fields (issue_date/act_record/parents/authority) NOT scored.
**Runs:** 2 docs (soviet, handwritten) × modes A/B/C × 2 models = 12 cells, all OK (no API errors).
**N=2 documents, one person → SIGNAL, not proof.** A prod decision needs varied people/doc-types.

## Modes
- A: SMART_OFF / ANTI_OFF / SELF_OFF (current prod behavior)
- B: SMART_ON / ANTI_OFF / SELF_OFF (P2 dictionaries)
- C: SMART_ON / ANTI_ON / SELF_ON, self-consistency N=3 (full gate)

## Results (per model; both docs gave identical verdicts)

| model | mode | correct/wrong/missing/NA (of 6) | false_negative_review | false_positive_review | DOB month gt/read | DOB caught? | self_consistency |
|---|---|---|---|---|---|---|---|
| gemini-2.5-flash | A | 0/5/0/1 | **5** | 0 | 06 / 02 | **MISSED** | — |
| gemini-2.5-flash | B | 0/5/0/1 | **5** | 0 | 06 / 02 | **MISSED** | — |
| gemini-2.5-flash | C | 0/5/0/1 | **0** | 0 | 06 / 02 | **CAUGHT** | mismatch (instability=true) |
| gemini-3.1-pro-preview | A | 1/4/0/1 | 2 | 0 | 06 / 07 | CAUGHT | — |
| gemini-3.1-pro-preview | B | 1/4/0/1 | 2 (0 on soviet) | 0 (1 on soviet) | 06 / 07 | CAUGHT | — |
| gemini-3.1-pro-preview | C | 1/4/0/1 | **0** | 1 | 06 / 07 | CAUGHT | agree (soviet: mismatch) |

## Findings

1. **The gate (mode C) drives `false_negative_review` to 0 in every cell** — both models, both docs.
   Without it (A/B), 2.5-flash emits 5 wrong identity fields with `review=false` (confident fabrication)
   and MISSES the DOB month error. With it, every identity field is forced to review, the DOB
   month-mismatch is CAUGHT, and self-consistency reports `mismatch`/instability on 2.5-flash. **This is
   the proven, model-independent safety win.**
2. **DOB month-mismatch (the critical test-case):** GT month = 06 (June). 2.5-flash read month 02, 3.1-pro
   read month 07 — both WRONG, and inconsistent with each other and with prior runs (July seen earlier) →
   gross instability on the date. Gate result: 2.5-flash MISSED in A/B, CAUGHT in C; 3.1-pro self-flagged
   DOB (review=true) even in A, CAUGHT throughout.
3. **SMART_NORMALIZE (B vs A): no accuracy improvement** on these docs (2.5-flash 0/5 = 0/5; 3.1-pro 1/4 =
   1/4). On 3.1-pro soviet, B even introduced a `false_positive_review` (place normalization flagged a
   correct field). → SMART shows zero correctness benefit here, small UX cost.
4. **Model comparison (hard-case):** 2.5-flash is materially worse — 0/5 correct (reads a different
   person) and DOB unflagged (FN=5) without the gate. 3.1-pro: 1/5 correct and self-flags DOB (FN=2).
   Neither is trustworthy unaided.

## CORRECTED — the "RU spelling" misses are real errors, not a language artifact

> **Superseded (owner, 2026-06-04).** An earlier version of this section excused the wrong given/patronymic
> reads as a "RU-document vs UA-ground-truth" language-layer mismatch. **That was wrong.** The product's
> documents are **Ukrainian**; GT = the Ukrainian text as-written. When the model returns a **Russian form**
> of a Ukrainian name/patronymic (or drops the apostrophe `ʼ`, or Russianizes `і/ї/є/ґ`), that is a **WRONG
> read / language substitution = a real model error to penalize**, not expected transliteration. So the
> hard-case per-field accuracy below is NOT a scoring-inflated lower bound — it is the true error rate.
> See `UKRAINIAN_OCR_FAILURE_ANALYSIS.md` and `GT_LANGUAGE_INTENT.md`.

## Reconciliation — 2026-06-04: GT now 6/30 ready; only 3/6 are live-door-scorable

Owner reported GT ready = 6. **Verified from `qa-private/ground-truth/` (raw, no values printed):** exactly
**6** files are `VERIFIED_BY_OWNER` with all `owner_verified_fields` filled — `birth_cert_soviet` (6/6),
`birth_cert_handwritten` (6/6), `internal_passport` (5/5), `military_id_p1` (6/6), `i94_owner_fill` (6/6),
`ead_owner_fill` (6/6). **The GT-count blocker is cleared.**

But "GT ready" ≠ "accuracy-scorable through the live door". Of the 6:
- **birth_cert_soviet, birth_cert_handwritten** — scored (registry `ua_birth_certificate`, real image). In raw.
- **internal_passport** — **NEW datapoint this session** (registry `ua_internal_passport_booklet`, real image).
- **military_id_p1** — GT ready but **no registry doc type** (`ua_military_id` absent) → cannot route through `readDocument`. NOT scored.
- **ead / i94** — GT ready but **US documents** (no UA-reader path) **and no upright real image** (only rotated `*_rot*` variants exist). NOT scored.

So the owner's "accuracy run on 6 docs" is **not** backed by evidence — raw + this rerun cover **3** live-door docs. The other 3 are GT-ready-but-not-live-scorable for the structural reasons above.

### New datapoint — internal_passport @ gemini-3.1-pro (mode A; gate does not target printed passport)
`raw → qa-private/reports/accuracy-offon/passport_rerun_raw.json`

| field | verdict |
|---|---|
| family_name_cyrillic | match |
| given_name_cyrillic | match |
| date_of_birth | match (semantic) |
| patronymic_cyrillic | **not_read** (reader returned no `middle_name`) — coverage gap, NOT a wrong value |
| sex | not_read (passport booklet spec emits no `sex` field) |

**3/3 of the fields it read are correct.** First printed-UA accuracy datapoint through the real door —
encouraging but N=1, and it exposes a patronymic **coverage gap** (the reader dropped the
`middle_name`/«По батькові» field entirely). Latent: the booklet field is named `middle_name`, which
collides with the CLAUDE.md hard-rule (Patronymic ≠ Middle Name) — flagged, not fixed here.

## Bottom line (updated 2026-06-04)
- GT-count blocker: **CLEARED** (6 verified). But live-door-scorable = **3** docs, not 6.
- Hard-case Ukrainian (2 birth certs): **1/4 correct even on 3.1-pro** (only family_name; given/patronymic/DOB wrong). **UNRESOLVED_BLOCKER.**
- Safety: **mode C drives `false_negative_review` to 0 on both hard-case docs** (handwritten needs C, not B) → the gate works. Re-confirmed against GT this session.
- Printed UA passport: **3/3 read fields correct** (N=1) + a patronymic coverage gap to fix.
- SMART_NORMALIZE: no accuracy gain → **DO_NOT_ENABLE**.
- Threshold calibration: **BLOCKED_INSUFFICIENT_N** — 3 live-scorable docs (~11 fields) cannot responsibly fit numeric confidence thresholds (0.97/0.9/0.8). Decision *rules* are validated; the *numbers* are not.
