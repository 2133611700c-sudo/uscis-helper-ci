# ONE BRAIN = Document Core — locked architecture decision

**Status:** ACCEPTED (owner + agent, 2026-05-30). Supersedes any earlier "which AI is primary" framing.
**Read this first** when continuing the one-brain work in a new session.

---

## The real problem (not legal — product reliability)
5 products (Translation, TPS, U4U, Re-Parole, EAD) fill USCIS forms from Ukrainian documents. Today recognition is split across **different engines that do not agree**:
- TPS / U4U / Re-Parole → `/api/tps/ocr/extract` (Google Vision/DocAI OCR-text → **DeepSeek** extracts fields; + Gemini arbiter for the booklet).
- Translation → `/api/translation/vision-extract` (**Gemini** docintel reads the image directly).
- EAD → manual only, no recognition.
Same passport ⇒ different output in TPS vs Translation. "Read the document" has **no single owner**.

## The decision — owner of the DECISION is the Document Core, NOT any AI
"One brain" is **not** "one AI." It is **one Core arbiter** that drives all readers and emits **one `CanonicalDocumentResult`**.

```
upload (image/pdf)
  → quality gate (preprocessImage)         → bad → "retake photo" (never garbage)
  → DOCUMENT CORE  (one runtime entrypoint = one decision-maker)
       tools/readers (candidates only, NEVER final):
         • Gemini docintel   = primary VISUAL reader (image → candidates, Cyrillic + EN)
         • MRZ parser        = MATHEMATICAL authority for passport MRZ fields (check digits)
         • Vision/DocAI      = layout/evidence + DEGRADATION fallback (not decision-maker, not retired)
         • DeepSeek          = cheap TEXT helper (not reader, not final, not critical authority)
         • KMU-55 / registry = DETERMINISTIC normalizer (transforms a candidate; NOT a source)
       ARBITRATION POLICY    = the judge → ONE CanonicalDocumentResult
  → 5 thin product adapters consume the SAME result (each fills its USCIS form; Translation also translates via KMU-55)
  → shared review: user edits fields → 2 checkboxes → sign → PDF/packet (legal stays simple)
```
**Product quality = Core quality (arbitration + confidence + safe fallback), not the OCR.** Readers are swappable backends.

## Responsibility per layer (final)
| Layer | Role | Hard limits |
|---|---|---|
| **Document Core** | owner of the decision | the ONLY thing that emits a final field |
| **Gemini docintel** | primary visual reader | candidates only, never final |
| **MRZ parser** | math authority (passport MRZ) | controls passport_number/DOB/expiry/sex/latin name/nationality **only when check digits valid** |
| **Vision/DocAI** | layout/evidence + degradation | not decision-maker; kept for fallback when Gemini unavailable |
| **DeepSeek** | text helper | never reads image, never final, never critical authority |
| **KMU-55 / registry** | deterministic normalizer | transforms a candidate; not a source |
| **Arbitration policy** | judge | the heart of the Core |

## Rules (accepted corrections)
1. **MRZ invalid → review** (critical passport fields `review_required`), NOT silent fallback to Gemini. Composite check, not just per-field.
2. **KMU-55 normalizes Gemini's Cyrillic candidate**, it is not an independent source (`Тарас → Taras`).
3. **Evidence needs grounding.** In **v1, "evidence" = provenance** (which reader + raw value preserved), NOT a verified bbox. Full value↔bbox grounding is v2 (after the existing `bbox`/`ocr_ids` is proven). Else "no evidence → no field" deadlocks v1.
4. **Vision/DocAI stay for DEGRADATION** (Gemini down/rate-limited → Vision OCR + safe review mode, site keeps working). Not retired before benchmark.
5. **Build order:** spine + **minimal authority policy** → benchmark → expanded cascade/matrix. Minimal policy = (a) **principle rules now** (MRZ-valid wins; MRZ-invalid→review; KMU-55 normalizes; fuzzy geo→review; critical conflict→review; no source→no field) + (b) **empirical knobs from the reader benchmark**.
6. **Multi-page/multi-document = case-level identity** (passport controls identity; I-94 admission; EAD A-number/category; DL address-only).

## Two benchmarks (do not conflate)
- **(a) Reader benchmark:** raw Gemini vs raw Vision+DeepSeek vs raw MRZ, each vs hand-verified ground truth. "Three outputs side by side" = the DATA that informs the policy. Needs real documents.
- **(b) Core benchmark:** arbitrated Core output vs ground truth — needs the minimal policy.
Order: reader-benchmark → write minimal policy → core-benchmark → products.

## Metric (locked)
Best Core = **`critical_wrong_count == 0`**; uncertain NOT auto-filled; raw preserved; `review_required` surfaced; no silent correction. **NOT coverage.**

## What requires real input (cannot proceed without it)
A few **real Ukrainian documents + hand-verified ground truth** (owner-provided): ≥1 international passport (MRZ) and ≥1 internal booklet (handwriting, no MRZ). Without them the empirical knobs cannot be derived and nothing can be proven. Ground-truth format: `apps/web/src/lib/canonical/core/groundTruth.example.json`.

## Status of code (as of this decision)
- v1 spine = `apps/web/src/lib/canonical/core/` (arbitration + readDocumentCore + benchmark + ground-truth format) — pure, unit-tested, **NOT wired to any product, NO flags**.
- **No product consumes the Core yet** → "one brain" is NOT done. It is done only when a product actually reads `CanonicalDocumentResult` in production.
- Product migration requires explicit owner approval (manual).
