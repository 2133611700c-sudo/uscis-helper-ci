# Live Rotated-Booklet Recognition Failure — Root Cause & Fix
**Date:** 2026-05-30 · Severity: CRITICAL · Trigger: owner live-tested prod with a
ROTATED Ukrainian internal-passport booklet (1 page).

## Observed (owner live test)
- **TPS:** family=`Akulenko`, given=`„ Пріз` (label garbage), patronymic=`Tarasovych` (stale), DOB/sex/passport=missing.
- **Translation:** surname=`Шуляк/Shuliak`, given=`Тарас/Taras`, place=`с.м.т. Проскурів/Proskuriv` — **unrelated** to the uploaded passport.

## Root cause (evidence-backed, zero-trust)
1. **Stale state leakage (the unrelated `Шуляк/Тарас/Проскурів`).** Those strings are **NOT in the codebase** (grep clean; the SAMPLE placeholder is `ПРИКЛАД/SAMPLE`). They were a **previous session's `extractedFields`**, restored from storage:
   - Translation wizard restored `sessionStorage tw:v2:draft` on **every mount**.
   - TPS wizard restored `localStorage wizard:tps-ukraine:v2:state` (full state, ≤60-day window).
2. **OCR garbage accepted as value (`„ Пріз`, `Akulenko`).** A rotated page yields low-quality OCR; a fragment of the label «Прізвище» with a quote glyph was shown as the given name. No guard rejected label-as-value.
3. **No orientation gate.** A rotated page was parsed instead of being rotated/blocked.
4. **No source-evidence gate.** Fields were shown as "recognized" without proving they came from the current upload.

## Fixes shipped (this PR)
| Fix | What |
|---|---|
| **Translation session isolation** | draft-restore now early-returns unless `?paid=1` (Stripe round-trip); a fresh visit starts clean. `handleFiles` already clears fields on a new upload. |
| **Garbage guard** (`packages/knowledge/garbageGuard.ts`, shared SoT) | `classifyGarbage`/`isGarbageValue` reject: empty, label-as-value (`Прізвище`…), quote+label (`„ Пріз`), punctuation-only, too-short. |
| **Garbage guard wired — Translation** | on extract: a garbage value → empty + `review_required` (shown as "enter manually", never as recognized). |
| **Garbage guard wired — TPS** | at the field-merge (drop garbage so it shows as manual-entry) AND on localStorage hydration (drop stale garbage on restore). |

**Effect:** a rotated booklet now yields **honest "Не найдено — введите вручную"** for unreadable fields instead of `„ Пріз`/`Akulenko`; a fresh visit no longer shows a prior session's `Шуляк/…`.

Tests: `garbageGuard.test.ts` 4/4 (incl. `„ Пріз`), `sessionIsolation.test.ts` 2/2, full web suite pass, tsc 0, content-guard 0.

## Remaining (enhancements, NOT safety-blocking now)
- **Orientation auto-rotate** (0/90/180/270 + anchor scoring) — would *recognize* rotated pages instead of dropping them to manual entry. Currently rotated → garbage-guarded → manual entry (safe but not auto-read).
- **Source-evidence gate** (require bbox/page_type/rotation before "recognized") — formalize the evidence contract.
- **Payment/signature block** when critical identity fields are unsafe/missing.
- **TPS full-state isolation** — the TPS wizard restores full upload state by design (refresh resilience); a per-document-session id would harden it further than the garbage-drop-on-restore added here.

## Status
```
status:        DEGRADED→SAFER (garbage/stale no longer surfaced; auto-rotate pending)
root_cause:    stale-state restore + OCR-garbage acceptance + no orientation/evidence gate
wrong_values_origin: previous-session fields restored from sessionStorage/localStorage (NOT code)
fixes:         session isolation (Translation) + shared garbage guard (Translation + TPS)
tests:         garbageGuard 4/4 · sessionIsolation 2/2 · full web pass · tsc 0 · guard 0
remaining_risk: rotated pages drop to manual entry (not auto-read); TPS full-state isolation partial
next_action:   orientation auto-rotate + source-evidence/payment-block (focused pass)
```
