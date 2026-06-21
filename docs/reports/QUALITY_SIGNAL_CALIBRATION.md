# Runtime Quality Signal — Calibration (local, no API)

**Date:** 2026-06-04  **Method:** ran `preprocessImage` (sharp, local) over all real
fixtures — quality metrics ONLY, no OCR, no Gemini/Vision, no text extraction.
**Raw (local, gitignored):** `qa-private/reports/quality-calibration/quality_calibration_raw.json`.
**Sanitized:** doc labels are coarse type + short hash (no names/PII). N is small — not accuracy.

## Corpus

- documents_scanned: **27** (11 `test-fixtures/real-docs/` + 16 `qa-shots/private/`), all preprocessed OK, 0 errors.
- quality_fields: `brightness`, `blurScore` (Laplacian stdev), `assessment` (good/acceptable/poor), `warnings[]`, `resized`, `scaleFactor` (`image-preprocess.ts`; reject thresholds MIN_BLUR_SCORE=2.5, mild_blur<8).

## Distribution

- **blur_distribution:** min 25.89 · median 38.91 · max 62.11
- **brightness_distribution:** min 115.5 · median 192.5 · max 244.1
- **assessment_counts:** good 22, acceptable 5, **poor 0**
- **warnings_counts:** `high_brightness` 5 (no blur warnings; nothing near the 2.5 reject floor)

Lowest blur: passport (25.89), divorce (27.13), ead (27.16), ead_rot180/270 (27.22).
Highest blur: dl (62.11), dl_rot90 (62.09), marriage (57.08), marriage (52.25), military (49.91).

## Hard-case positions (the decisive part)

| doc (sanitized) | group | blurScore | brightness | assessment |
|---|---|---|---|---|
| birth_soviet | real-docs | **36.41** | 166.2 | good |
| birth_handwritten | real-docs | 36.41 | 166.2 | good |
| passport (clean, reliable) | real-docs | **25.89** | 193.5 | good |
| passport | qa-shots | 29.63 | 136.6 | good |
| booklet | qa-shots | 40.39 | 115.5 | good |
| military | real-docs | 33.90 / 49.91 | — | good |
| marriage (printed) | real-docs | 32.96–57.08 | — | good |

**The CONFIRMED-fabricating `birth_soviet` (blur 36.41, `good`) is SHARPER than the
reliably-correct passport (blur 25.89).** The dangerous document scores BETTER on quality
than the safe one.

## Threshold recommendation

**quality_signal_reliability: NOT a reliable anti-fabrication detector on this corpus.**
- A Soviet/handwritten certificate that fabricates identity is a *sharp, well-lit photo of
  handwritten/bilingual content* → high blurScore, `good` assessment. blurScore measures
  visual sharpness, NOT content ambiguity or handwriting.
- `blurScore` and `assessment` do NOT separate fabrication-risk docs from clean ones — they
  rank the fabricating birth cert ABOVE the safe passport.
- There are also NO genuinely degraded/blurry samples in the corpus (everything is good/
  acceptable; nothing near the 2.5 reject floor), so a degraded-scan threshold cannot even be
  calibrated from this data.

**Recommendation:**
- Do **NOT** wire `low_quality_scan` (blurScore/assessment) as an anti-fabrication GATE
  trigger. It would miss the actual risk (sharp handwritten certs) and is uncalibratable here.
- Keep the quality signal as **logging / provenance only** (the prior design's Option C) and
  as a *rescan prompt* for truly degraded uploads — NOT as identity-review forcing.
- The fabrication risk stays governed by the **class allowlist** (handwritten birth classes)
  and, when built, **self-consistency** (multi-read identity-hash disagreement). Those are the
  signals that actually track the failure.

## Honest scope

- `low_quality_scan ≠ handwritten`. `blurScore` does NOT detect handwriting.
- Quality is at best a secondary degraded-scan signal — and this corpus shows it does not
  fire on the dangerous documents.
- N=27, no verified GT → stability/quality only, NOT accuracy.

## Next action

Owner decides: keep quality as logging/provenance only (recommended) and prioritize
self-consistency (multi-read identity-hash) as the real anti-fabrication detector for
handwritten/ambiguous docs — over a blur threshold that does not discriminate.
