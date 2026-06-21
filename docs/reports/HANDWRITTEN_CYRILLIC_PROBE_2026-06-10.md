# Handwritten Cyrillic — honest multi-run probe (2026-06-10)

Reason: prior reports over-emphasized PRINTED Cyrillic. The product's real need is
HANDWRITTEN Cyrillic (old/Soviet certificates, handwritten passports). This probe
tests the live prod read (gemini-3.1-pro-preview) on 3 handwritten owner documents,
**3 runs each**, scoring the critical identity fields against owner GT. Raw values
stay in gitignored qa-private; this doc carries field-level outcomes + failure mode only.

## Result (3 runs each, Cyrillic match vs GT)

| field | booklet (hw) | birth (hw) | birth (Soviet) |
|---|---|---|---|
| surname | 3/3 ✓ stable | 3/3 ✓ | 3/3 ✓ |
| given name | 3/3 ✓ stable | 3/3 ✓ | 3/3 ✓ |
| patronymic | **0/3 ✗ stable** | 3/3 ✓ | 3/3 ✓ |
| date | 3/3 ✓ | **0/3 ✗ stable** | **0/3 ✗ stable** |

## Honest read — corrects the earlier framing

- **Handwritten NAMES read well and stably** — 11/12 name fields correct across the
  three documents. The model is genuinely good at handwritten Cyrillic *names*. The
  earlier "handwritten unreliable" was too pessimistic (it was single-run variance).
- **Handwritten DATES are the real, systematic failure** — 0/3 on both birth certs,
  **stably wrong** (same wrong value every run = confident misread, not random noise).

## Failure mode (diagnosed)

On the handwritten birth cert the model misreads the handwritten **month word**
(one Ukrainian month read as an adjacent one) and a **day digit**, and — critically —
copies that single date into BOTH the date-of-birth and date-of-issue fields
(it locates one date and assigns it to two slots). Every field involved is
review-flagged, so the human catches it — but the machine itself is wrong.

## What this means for the core goal

- "The brain reads handwritten Cyrillic" is **TRUE for names, FALSE for dates** today.
- Safety holds (all wrong fields are review-flagged → no silent bad output), but
  accuracy on handwritten dates is not there. Human review is doing the work on dates.

## Concrete next steps (handwritten dates — the real target)

1. **Disambiguate date fields** so the model cannot copy one date into both
   date-of-birth and date-of-issue (positional/label grounding in the prompt/schema).
2. **Test a zoomed field-region crop** of the date area fed to the model — geometric
   (safe, REORGANIZES not removes; the rejected tonal preprocessing is different).
   Measure OFF/ON on these handwritten docs before trusting it.
3. Keep always-review on handwritten dates regardless — it is the backstop.

## Method note

3 runs surface stability; handwritten reads can vary run-to-run, so single-run
numbers (earlier reports) were misleading. Multi-run is the honest method.
