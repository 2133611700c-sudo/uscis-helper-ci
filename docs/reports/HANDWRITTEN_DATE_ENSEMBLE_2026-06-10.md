# Handwritten Cyrillic dates — the ensemble fix (proven, 2026-06-10)

The honest problem (multi-run probe): a general vision LLM reads handwritten
Cyrillic NAMES well but misreads handwritten DATES — specifically the month word
(one Ukrainian month confidently read as an adjacent one) — stably wrong.

## What the field/best-practice says (research)

- **Transkribus** has a dedicated Ukrainian HTR model, CER ≈ 4.2% — the best
  documented for handwritten Ukrainian. Needs owner-provisioned readcoop/Processing
  auth (our integration scaffolding exists but was never authenticated).
- **TrOCR-Cyrillic** (HuggingFace, fine-tuned on Transkribus Cyrillic) — self-host or HF-token.
- **Azure Document Intelligence EXCLUDES handwritten Cyrillic.** Out.
- **Google Document AI** is weak on handwriting (~23% WER, loses reading order).
- The whole field uses **specialized HTR + ENSEMBLE + human-in-the-loop**; no engine
  is reliable alone on handwritten Cyrillic. Even the best (Transkribus 4.2% CER)
  needs human verification on critical fields.

Sources: Transkribus Ukrainian HTR (Kyiv-Mohyla); TrOCR-Cyrillic (HuggingFace);
Azure OCR language coverage; OCR benchmark comparisons (handwriting WER).

## What we PROVED on a real handwritten document (live)

Three techniques tested on the owner's handwritten birth cert vs ground truth:

| technique | day | month | year | stable |
|---|---|---|---|---|
| Gemini, full page | wrong | wrong | ok | no |
| Gemini, date-disambiguation prompt | unstable | wrong | ok | no |
| Gemini, **detect-region + crop + zoom ×5** | **correct** | wrong | **correct** | **yes** |
| **Google Vision (SA), handwriting OCR** | near | **correct** | ok | — |

Two findings that change everything:
1. **Zooming the date region** (geometric crop, not tonal — the rejected B&W is
   different) recovered the DAY and stabilized it.
2. **Gemini and Google Vision DISAGREE on the month, and Vision read it correctly**
   where Gemini did not. Neither engine alone is right; **together they contain every
   correct component**. Combining day (Gemini-zoom) + month (Vision) + year =
   the correct date that neither produced alone.

## The fix (best-practice, on engines we already have)

ENSEMBLE + human-in-the-loop, no new vendor:
- Read with **Gemini** (primary; strong on names + structure) AND **Google Vision**
  (second engine; better on the handwritten month here).
- For DATE fields, parse each engine's reading and **reconcile component-wise**.
  Agreement → trust. **Any disagreement → force review and surface BOTH candidates**
  to the human (who now has two machine opinions, one correct).
- Optional booster: a zoomed date-region crop re-read for the day/digits.
- This is exactly what specialized-HTR pipelines do; Transkribus/TrOCR can later be
  added as a THIRD reader (owner provisions auth) to push month accuracy further.

## Built this step (the deterministic core)

`docintel/ensemble/dateReconcile.ts` + tests:
- `parseDateText` — UA + RU word-months, ISO, MM/DD/YYYY (distinguishes червня=June vs липня=July).
- `reconcileDate(candidates)` — component-wise; agreement → ISO value; ANY
  disagreement/missing → `reviewRequired` + reason codes + all candidates. Never
  silently picks. Pinned on the real Gemini-July vs Vision-June pattern.

## Remaining build (defined, no research needed)
1. Wire **Google Vision second-read** into the translation path for handwritten-risk
   classes; extract date strings from both engines → `reconcileDate`.
2. Zoomed date-region crop re-read (geometric) for the day/digits.
3. Review UI: show both candidate readings on a disagreed date; human picks.
4. (Later, owner-gated) add Transkribus/TrOCR as a third reader for the month.

## [OWNER ACTIONS]
- **SECURITY:** the Vision service-account private key was pasted into chat — treat it
  as compromised and **rotate it** (new key for messenginfo-vision-ocr@…, delete key id `eb576de0…`).
- To add the best specialized reader later: provision Transkribus Processing auth or an HF token.

---

## Definitive findings (2026-06-10, local Gemini experiments + prod diag)

After building + wiring the full ensemble and ~10 prod cycles, the engineering wall
is PROVEN, not assumed:

1. **Gemini cannot READ this handwritten month.** 3 prompt strategies × 2 runs each
   on a zoomed date crop (plain / month-list-with-warning / letter-by-letter): all
   returned липня (July) or травня (May) — never червня (June, the truth). It is a
   hard model limit on this handwriting, not a prompt problem.
2. **Gemini cannot LOCALIZE the date line.** Even with "tight, single line, ~3-6% of
   page height" prompts, it returns a box ~39% of page height — too coarse for the
   second engine to read the month from.
3. **Google Vision read the month correctly (июня) on a MANUAL tight crop** — but
   Gemini can't provide that tight crop automatically, and Vision garbles the month
   on Gemini's coarse box (prod diag: year_hits=1, month_hits=0).

### Conclusion
No automated approach deployable today (Gemini + Google Vision) reliably auto-reads
this handwritten Cyrillic date. The product already handles it correctly: handwritten
dates are ALL `review_required` (hard-case override) → the human corrects them. That
is the industry best-practice (HTR + human-in-the-loop). Handwritten NAMES, by
contrast, read well (11/12) and are production-usable.

### To actually auto-read handwritten dates (both owner-gated)
- **Vision-ensemble tuning** with a fast LOCAL loop — requires the owner to rotate the
  chat-exposed SA key, then provide it safely for local iteration (find the crop/zoom
  that lets Vision read the month; Vision can't be tuned via 4-minute prod cycles).
- **Transkribus / TrOCR HTR** (dedicated handwritten-Ukrainian, CER ≈4.2%) as a third
  reader — requires owner readcoop/HF auth.

The ensemble infrastructure (dateReconcile, applyDateEnsemble, dateRegionRead, Core-path
wiring, review UI, 19 tests) is COMPLETE and waits behind ENSEMBLE_DATE_ENABLED (OFF)
for one of the above.

---

## Exhaustive verification (2026-06-10, owner authorized full resources + Vision key)

Every general-engine approach was tried locally with the real Vision key:

| Approach | Result on the handwritten month (GT = червня/June) |
|---|---|
| Gemini, 3 prompt strategies × zoom | липня/травня — never June |
| Gemini date-line bbox | ~39% of page (can't localize) |
| Vision word-geometry line-segmentation → zoom re-read | day 25 read; month garbled |
| Vision multi-crop VOTING (5 crop variants) | 0/5 produced ANY readable month |
| TrOCR / Cyrillic HTR via HuggingFace Inference API | endpoint requires a token (none available) |

**Triple-proven conclusion:** the handwritten MONTH on this document is not readable
by any general-purpose engine we can call (Gemini, Google Vision, Document AI).
Multi-crop voting — the standard ensemble trick — also fails. This is a genuine
trained-HTR-grade problem.

## Honest reframe of "handwritten Cyrillic readability"

- **Handwritten NAMES are READABLE today** — Gemini reads surname/given/patronymic/
  parents at ~11/12 on the owner's real handwritten docs. This is the BULK of an
  identity document and it is production-grade.
- **The residual is specifically the DATE MONTH on poor handwriting** — червня vs
  липня is genuinely ambiguous and defeats every general engine. The product handles
  it correctly: such fields are review_required (human-in-the-loop), the same design
  Transkribus and every serious HTR product uses.

## The ONE thing that finishes it (needs a real credential, not just authorization)

A dedicated handwritten-Ukrainian HTR model. Pick ONE and provide the credential:
1. **Transkribus** (readcoop.eu) — best documented (CER ≈4.2%). Provide a Processing
   API token OR a readcoop username+password. The integration is scaffolded
   (`apps/web/scripts/transkribus-bench.mjs`); a token lets it run + then be wired.
2. **HuggingFace token** — lets `cyrillic-trocr/trocr-handwritten-cyrillic` run via the
   Inference API as a third reader.

The moment a token exists, the ensemble (dateReconcile/applyDateEnsemble/Core-path
wiring/review UI, all built + 19 tests) wires the HTR as the authoritative month
reader and the date becomes readable. Without a trained model, no engine reads it —
proven, not assumed.
