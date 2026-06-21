# P0 — Root Cause Analysis (forensic, evidence-based)

**Date:** 2026-06-06. Why the owner's birth-cert upload gave "0 results" in the translator AND why TPS showed a
wrong/flagged patronymic + many blank fields. Evidence from code (read-only). No code changed.

## Incident facts (owner-reported)
- Translator (translate-document): uploaded свидетельство о рождении → **0 results, "recognizes nothing"**, menu looked different.
- TPS form: family `<family-name>`, given `<given-name>`, **patronymic `<patronymic-suffix-fragment>` flagged "проверьте AI"**, DOB `<dob>`,
  city `<city>`, oblast `<oblast>`; everything else **"Не найдено — введите вручную"**.

## Root causes (ranked, with evidence)

### RC-1 — Translation public wizard skips extraction for birth certs (the "0 results")
`TranslateWizard.tsx`: `{ id:'birth', auto:false, registryId:'ua_birth_certificate' }`. The processing function
(L984): `if (!meta?.auto || !registryId) → manual-review path → NO API call → empty fields`. So a birth cert in
the **public** translator never calls `/vision-extract` → 0 fields by design. Confirmed: prod logs show **no
`/api/translation/vision-extract` call** during the incident. **This is config, not a crash.** Set in commit
`fca0582 "full wizard rewrite per owner-provided navy/gold prototype"`. Likely intended (hard-case → manual),
but the UX presents it as "broken / 0 results" with no explanation.

### RC-2 — A WRONG value is shown AS the field value (candidate ≠ final not enforced) — the "<patronymic-suffix-fragment>" problem
TPS showed patronymic = **`<patronymic-suffix-fragment>`** (a truncated suffix of "<full-patronymic>") flagged "проверьте AI". The
anti-fab/self-consistency gate **forces review but never corrects or hides the value** — it keeps the (wrong)
value and sets `review_required`. There is no global rule that a low-trust/garbled critical value must be
shown as **candidate-only / blank+manual** instead of as the field's value. So the user sees wrong data that
"looks recognized." Same class: DOB month `05` (likely should be `06`) shown as a value.

### RC-3 — Six reader paths, four safety regimes (no global contract) — the structural cause
A critical field can originate from: docintel(Gemini, gated) · TPS-core(Gemini, gated) · TPS-legacy-modules
(Google Vision/regex, **ungated**) · Translation-session(**DeepSeek**, ungated, conf<0.70) · Translation-public
(Gemini, gated, but skipped for `auto:false`) · legacy `/api/ocr/extract`(**gpt-4o-mini**, ungated; called by
`/api/ocr/translate`). `review_required`/`manual_required` are defined differently per path. **"Safe" proven on
one path is not safe globally** — exactly why prior narrow PASS verdicts overstated safety.

### RC-4 — TPS is a multi-document aggregator; a single birth cert can't fill form fields
`tps/ocr/extract` runs per-doc modules + a core path and aggregates via `centralBrain.ts`. Fields like
passport_number (international passport bio page), i94_admission (I-94), a_number (EAD) need **other uploaded
documents**. With only an internal passport / birth cert, those are legitimately "Не найдено" — but the UI
shows them as bare "Не найдено — введите вручную" with no "upload document X" guidance, so it reads as failure.

### RC-5 — TPS core→legacy fallback re-introduces ungated extraction
`tps/ocr/extract` L260-285: if `readDocument` (core) returns ≥1 field → gated core used; **else falls back to
the legacy module** (`runMilitaryIdModule`, `runBirthCertificateModule`, …) which is NOT gated. So whenever the
Gemini core under-reads, TPS silently drops to an ungated regex/Vision module — inconsistent safety per request.

## What is NOT the cause (ruled out with evidence)
- **My D0 work** — `QUALITY_GATE_ENABLED` is ABSENT in prod (`vercel env ls`); the D0 hook never runs → byte-identical.
- **Anti-fab/self-consistency gates** — they KEEP values + flag; verified locally they don't blank fields.
- **A server crash / outage** — 0 error/fatal/5xx in prod logs for the window; healthz ok.
- **Supabase outage** — no evidence; not implicated in these flows.

## Confidence
HIGH for RC-1 (config confirmed in code + logs), RC-3/RC-4/RC-5 (code-confirmed structure). MEDIUM-HIGH for RC-2
(the "<patronymic-suffix-fragment>"/DOB are real model errors shown as values; the missing "candidate≠final" rule is confirmed absent).

## Minimal containment readiness (proposal only — NOT implemented in P0)
A shared `ocrFieldSafetyGate` (P-phase) that: (a) for a low-trust/garbled/hard-case critical field → emit
**candidate-only / blank+manual**, never as the field value; (b) enforces ONE review/manual definition across
paths; (c) blocks PDF/payment on unresolved critical; (d) clarifies "Не найдено → upload doc X". Plus a small
product decision on RC-1 (birth `auto:true` with mandatory review, or a clear manual-review screen). These are
specified in `GLOBAL_OCR_FIELD_SAFETY_CONTRACT.md` + `P0_OCR_SAFETY_TEST_PLAN.md`. **No code changed in P0.**
