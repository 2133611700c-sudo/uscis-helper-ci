# P0 — Field Lifecycle Map (forensic, read-only)

**Date:** 2026-06-06. Where each critical field is created, who sets review/source, where it becomes "final",
and where safety can be lost. No code changed.

## Reader paths a field can come from (each with DIFFERENT safety)
| path | reader | provider | gated by anti-fab/self-consistency? | review rule | evidence |
|---|---|---|---|---|---|
| docintel door | `readDocument` | Gemini | **YES** | gate forces review on hard-case identity | `documentFieldReader.ts` |
| TPS core branch | `readDocument` → `toTpsAnswers` | Gemini | YES (when core returns ≥1 field) | gate | `tps/ocr/extract` L260-285 |
| TPS legacy fallback | `run*Module` (passport/booklet/military/birthcert/i94/ead/dl/i797) | Google Vision / regex | **NO** | per-module ad-hoc | `tps/ocr/extract` L35-42, fallback when core empty |
| Translation session | `translation/extract` | **DeepSeek** | **NO** | `confidence < 0.70 \|\| review_required` | `extract/route.ts` L73, L98 |
| Translation public | `vision-extract` | Gemini | YES (when `auto:true`) | gate | `vision-extract/route.ts` |
| Legacy OCR | `ocr/extract` | **OpenAI gpt-4o-mini** | **NO** | none observed | `ocr/extract` L195; called by `ocr/translate` |

**This is the core problem: the same field (e.g. patronymic) has 6 possible origins with 4 different
safety regimes.** "Verified safe" on one path ≠ safe globally.

## Per-field trace (critical identity)
For each: created → source label → review flag → merged → final → PDF.

- **family_name / given_name / patronymic**
  - created: whichever reader path above fired.
  - source label: set by the producing module/route (`Внутр. паспорт · OCR`, `AI распознавание`, …) — **not a
    single trusted authority; depends on path.**
  - review flag: docintel gate forces review on hard-case (value KEPT, flagged); DeepSeek path uses conf<0.70;
    legacy modules ad-hoc. **A WRONG value can be shown with a review flag (candidate shown as value).**
  - patronymic specifically: legacy/booklet path truncates to the suffix → **"<patronymic-suffix-fragment>"** shown as the value
    (should be "<full-patronymic>"); gate flags it ("проверьте AI") but does NOT correct or hide it.
  - merged: TPS via `centralBrain.ts` / translation via in-route map or Supabase `extracted_fields`.
  - final: client wizard state (public) OR Supabase `extracted_fields` (session) OR TPS answers.
  - PDF: `render` (session, payment+confirmed) / `generate-pdf` (public, `reviewGate`) / `tps/generate-packet`.

- **dob** — same paths; observed month misread (`<dob>` vs expected `06`) shown as a value. Date validation
  exists in some modules but not uniformly across all reader paths.

- **sex / citizenship** — internal passport often doesn't expose → "Не найдено" → manual entry (expected).

- **passport_number / passport_expiry** — source = international passport bio page; absent if not uploaded.

- **i94_admission / last_entry / status_at_entry** — source = I-94 doc; absent if not uploaded.

- **a_number** — source = EAD/USCIS doc; absent if not uploaded.

- **us_address / phone / email / marital_status** — **user input, never "recognized"** — correctly "Не найдено".

## Where safety is LOST (the gaps)
1. **No single `review_required` / `manual_required` definition** — docintel-gate vs DeepSeek-conf<0.70 vs
   legacy-module-adhoc. A field flagged on one path may be unflagged on another.
2. **Candidate ≠ final is NOT enforced** — a wrong value ("<patronymic-suffix-fragment>", wrong DOB month) is shown AS the field
   value, only decorated with a review flag. Nothing guarantees a wrong candidate can't be confirmed/printed.
3. **source_doc_type label is path-dependent, not authoritative** — TPS aggregates many modules; the label
   shown depends on which module produced the field, not a verified source anchor.
4. **Multi-doc aggregation (TPS)** — fields needing other documents (I-94/passport-bio/EAD) show "Не найдено";
   the UI doesn't clearly say "upload that document," so it reads as "recognized nothing."
5. **`auto:false` doc types (birth, marriage) on the PUBLIC wizard skip extraction entirely** → 0 fields,
   no API call (manual-review path), which the user experiences as "broken."

## Status
PASS for lifecycle mapping: every critical field's origin/flag/final/PDF point is traced. The blockers are
NOT "missing trace" — they are **divergent, ungoverned semantics across 6 reader paths** + **candidate shown
as final**. That is exactly what the Global OCR Field Safety Contract must fix.
