# Handwritten Cyrillic Date — targeted experiment (formally accepted limitation)

Date: 2026-06-16 · PII-free (no field values) · primary model gemini-3.1-pro-preview

## Question
Can the handwritten date of birth on the Soviet birth certificate be read accurately
and repeatably, or must it stay review/null?

## Method (GT never sent to the model; no cross-document data used)
Targeted date-region crop of the real birth certificate, compared 5 input strategies,
2 runs each: full_page · crop · crop_zoom2x · crop_contrast · crop_zoom_contrast.
Prompt: read ONLY the handwritten date, output DD.MM.YYYY or UNSURE, do not guess/infer.

## Result
- Day and year are read CORRECTLY by every strategy.
- The cursive month is read WRONG by every strategy (one month off — cursive
  Cyrillic н/л ambiguity, e.g. июня↔июля), CONFIDENTLY and REPEATABLY.
- The model NEVER self-reports UNSURE — it returns a confident wrong month.
- Preprocessing (crop / zoom / contrast / full page) does NOT fix it.
- Self-check caught a format bug in the first comparison script (DD.MM.YYYY vs the
  GT's YYYY-MM-DD); the raw-output verification is authoritative and confirms the
  month-confusion finding.

## Verdict (per the rule: confident-but-wrong → never auto-release)
The handwritten date is NOT safely auto-readable. The field MUST remain
review/null. No narrow reader/prompt change is safe (the model is confidently wrong
and does not self-flag). The production pipeline already flags it REVIEW — correct
behavior, unchanged. Cross-document MRZ (passport) is NOT used here to "fix" the
date (out of scope; that is an application-completeness mechanism, not date OCR).

## Open item for the HELD-OUT corpus (the real safety gate)
The model is overconfident on handwriting (no UNSURE). This sample was correctly
gated to REVIEW, but robustness — that EVERY handwritten critical date is reliably
sent to review so a confident-wrong value can NEVER be released as final — can only
be proven on a held-out corpus (other people / years / qualities). Until then, do
not auto-finalize handwritten dates.
