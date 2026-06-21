# Recognition & Translation Engine — Organizational Architecture

**Status:** Engineering blueprint (the "каркас"). Every component below is a *department* with a single *job description*; each AI/service is an *employee* with one accountable role. The **Central Brain is the Chief Engineer** who validates every department's output; the **Auditor** is the check-on-the-checker. No component does two jobs; nothing overlaps; on failure each knows exactly whose job it was.

Maps 1:1 to v5.0 "Controlled Autonomy" (AI drafts/validates/renders → human confirms critical fields → signs). The target is **NOT 100% autonomous reading** — it is: every department maximizes its read, the Chief Engineer knows where it is unsure, the human confirms only the flagged fields, and the output is a clean certified PDF.

---

## Org chart (one document's journey, 80-year-old user)

```
                          ┌─────────────────────────────────────────────┐
   user uploads photo →   │  CHIEF ENGINEER  (Central Brain)            │ ← validates EVERY dept,
                          │  holds canonical record, enforces v5 §7      │   resolves conflicts,
                          │  source hierarchy, decides review_required,  │   blocks render if a
                          │  BLOCKS render if any critical field has     │   critical field has no
                          │  no source trace                             │   source trace
                          └───────────────┬─────────────────────────────┘
   D0 Reception → D1 Recognition → D2 Normalization → D3 Translation → D4 QA → D5 Review → D6 Render
                          └─────────────── AUDITOR (provenance log + guards) watches all ──────────┘
```

---

## D0 — Reception / Intake (Приёмная)
**Mission:** never let a bad photo into the building; figure out what the document is and how many pages.

| Employee | Engine | Job description | Hard rules |
|---|---|---|---|
| Document Clerk | `sharp` (code, no AI) | Quality gate: detect blur/glare/low-res/skew. Auto-deskew, auto-rotate, crop-to-document. | Reject with **plain-language** retake guidance ("Свет закрывает дату слева снизу — переснимите у окна"), never "OCR failed". Anti-loop: after 2 retakes offer manual path. |
| Registrar | **Gemini Vision** (1 cheap call/page) | Classify document TYPE + each page's ROLE (identity / registration / photo / blank / apostille). Order & **group multi-page into one logical document**. | A 4-page passport is ONE document. Never translate page 1 alone. Output an ordered page-map. |

## D1 — Recognition (Отдел распознавания)
**Mission:** read the Cyrillic characters exactly as written. Read, do not interpret.

| Employee | Engine | Job description | Hard rules |
|---|---|---|---|
| Reader (Чтец) | **Gemini 2.5 Pro Vision** on tight field crops | Read Cyrillic VALUES per field. Return **top-3 candidates + per-field confidence**. | NEVER transliterate. NEVER guess: illegible → `can_read=false` + empty. Never return a suffix fragment ("ович" alone). |
| Proofreader | **Google Vision / DocAI** (printed zones only) | Second read of printed text (MRZ, printed certificate labels, series/number). | Used only where the document is printed; disagreement with Reader → flag for Chief Engineer. |

## D2 — Normalization & Knowledge (Отдел нормализации)
**Mission:** turn raw Cyrillic into canonical, legally-correct values using closed Ukrainian data. Deterministic. No AI.

| Employee | Engine | Job description | Source |
|---|---|---|---|
| Transliterator | **KMU-55 engine** (`transliterate.ts`) | Names Cyrillic→Latin (Тарас→Taras). Legally correct, deterministic. | KMU Resolution №55 |
| Validator/Corrector | **Gazetteer + Dictionary** (`packages/knowledge`) | Snap city→known UA place, oblast→25 set, authority→registry, **patronymic→generated/validated**. Reject impossible values. | gazetteer (NEW), `dictionary.ts`, `patronymic.ts` (NEW) |

## D3 — Translation (Отдел перевода)  ← **THE MISSING DEPARTMENT TODAY**
**Mission:** produce English text. Names/numbers come pre-locked from D2 — they are never re-translated.

| Employee | Engine | Job description | Hard rules |
|---|---|---|---|
| Terminologist | **Glossary** (`dictionary.ts`, code) | Translate closed terms: doc titles, agencies, civil-status terms, historical names (Міліція→Militsiya). Deterministic. | Historical-mode locks (Міліція≠Police). Never modernize old terms. |
| Translator (Переводчик) | **DeepSeek-V3** (cheapest) or Gemini | Translate ONLY open prose (notes, free text). Names/dates/numbers injected from D2 as locked tokens. | "Translate to formal English; do NOT touch the locked tokens; add nothing." Numbers never inferred (v5 §10). |

## D4 — Quality Assurance (ОТК)
**Mission:** catch errors before the human ever sees them.

| Employee | Engine | Job description |
|---|---|---|
| Inspector | Validator Suite (code) | Numeric double-pass, date zone-lock, source-trace presence, forbidden-phrase guard, scope/claim guard, identity consistency across pages. Flags low-confidence + cross-department disagreements. |

## D5 — Review & Client (Отдел клиента)
**Mission:** the 80-year-old confirms only what's uncertain, and cannot screenshot a finished doc to dodge payment.

| Employee | Engine | Job description | Hard rules |
|---|---|---|---|
| Account Manager | Review UI (code) | Show each field **beside its source crop**. One-tap "Исправить". | **Uncertain field → shown EMPTY**, never a confident guess (anti-hallucination-stamping). **Pre-payment: ONLY field rows** ("your name — right or wrong?"), NEVER the finished formatted document (anti-screenshot insurance). Finished doc only after pay + sign. |

## D6 — Rendering & Certification (Бюро выпуска)
**Mission:** assemble the professional bilingual document.

| Employee | Engine | Job description |
|---|---|---|
| Typesetter | `pdf-lib` (code) | Bureau-style **multi-page** English PDF. `[Stamp]`/`[Seal]`/`[Photo]` placeholders (v5: translate content, not layout). Attach original pages. Certification statement + signature, 8 CFR §103.2(b)(3). |

---

## CHIEF ENGINEER — Central Brain (Центральный мозг / Главный инженер)
The single accountable supervisor. Not a reader, not a translator — the **integrator and validator**.

Responsibilities:
1. Holds the **canonical merged record** (one value per field, with full provenance).
2. Enforces the **v5 §7 source hierarchy**: original doc text > readable stamps > controlling Latin (MRZ/I-94/EAD) > official transliteration > glossary > human. Earlier drafts/model memory are NEVER source of truth.
3. **Cross-checks every department against the others**: Reader's DOB must match a date pattern AND the prose date; Reader's city must pass the Gazetteer; patronymic must match D2's generated form for the given name; the two passport pages' identity must agree.
4. Decides `review_required` per field — green (agree + passes knowledge) auto-accepts; disagreement/fails-prior flags for D5.
5. **BLOCKS final render** if any critical field lacks a source trace (v5: "no source trace → no final output").

## AUDITOR — Oversight (Надзор / Внутренний аудит)
The check-on-the-checker, so the Chief Engineer is itself verified.

Responsibilities: log every field's provenance (which department/employee produced it, confidence, source-crop bbox, which pass); run forbidden-phrase + certification-claim guards on the final text; enforce PII handling (crops to vendor only with consent, retention policy); every correction logged → ground-truth dataset + correction memory (the learning loop).

---

## Where each existing piece sits (verified in code)

| Department | Exists today? | Evidence / gap |
|---|---|---|
| D0 Clerk (sharp gate) | ⚠️ in TPS only | `image-preprocess.ts` — not wired to translator |
| D0 Registrar (page classify/group) | ❌ missing | translator merges "earliest non-empty", no page roles |
| D1 Reader | ⚠️ whole-page, no crop | `geminiVisionProvider.ts` — single Flash call, no bbox |
| D1 Proofreader | ✅ TPS path | `google-vision.ts`, `docai/client.ts` |
| D2 Transliterator | ✅ solid | `transliterate.ts` (KMU-55, tested) |
| D2 Validator (gazetteer/patronymic) | ❌ missing | only 14 `GEO_CORRECTIONS`, no gazetteer, no patronymic engine |
| D3 Terminologist (glossary) | ⚠️ partial | `dictionary.ts` AUTHORITIES/DOC_TYPES — not wired into render |
| **D3 Translator (prose LLM)** | ❌ **MISSING** | **no LLM translation call anywhere — this is why it's an extractor, not a translator** |
| D4 Inspector | ⚠️ partial | `translationQaValidator.ts` exists |
| D5 Account Manager | ✅ exists | review row + crop; needs "empty-on-uncertain" enforced |
| D6 Typesetter | ⚠️ fields only | `bureauStyleRenderer.ts` / `packet/pdf.ts` — table fill, no prose, no multi-page assembly |
| Chief Engineer | ✅ exists | `centralBrain.ts` — needs cross-department checks extended |
| Auditor | ⚠️ partial | `ocrAudit.ts` — needs correction-logging learning loop |

## Build order (each increment shippable + testable)
1. **D2 Validator** — gazetteer + patronymic engine (deterministic, $0, zero-dependency). *Improves every read regardless of model.* ← START HERE
2. **D3 Translator** — prose LLM (DeepSeek-V3) with locked tokens. *Turns the extractor into a real translator.*
3. **D0 Registrar** — page classify + group (multi-page passport).
4. **D1 Reader** — crop localization + top-K.
5. **D6 Typesetter** — prose assembly + multi-page.
6. **Auditor** — correction → ground-truth learning loop.

## Ground-truth test set (N>1 — secured 2026-05-28)
`test-fixtures/real-docs/` (gitignored — PII): 9 documents, multiple distinct people — marriage (Zastavnyi/Kovshirina, 1939 Borodavka, Johnson/Kvasnikova, apostille), divorce (blank + redacted), birth (Ivanenko handwritten), military ID (Ivanenko). This breaks the N=1 self-deception. Every accuracy claim must be measured against owner-confirmed ground truth on this set.
