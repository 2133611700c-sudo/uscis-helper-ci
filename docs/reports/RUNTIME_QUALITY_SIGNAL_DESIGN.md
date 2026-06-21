# Runtime Quality Signal → readDocument — DESIGN ONLY

**Date:** 2026-06-04  **Type:** design, NO code, NO prod env, NO flag enable, NO push.

## Goal

Let the anti-fabrication gate trigger on RUNTIME degradation (low-quality / blurry /
oversized / rotated scans), not only on the static class allowlist
(`birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`). The signal
already exists in `preprocessImage` but is dropped before `readDocument`.

## Raw inventory (file:line)

**preprocess_call_sites** — all 4 products call `preprocessImage` BEFORE `readDocument`:
- TPS: `app/api/tps/ocr/extract/route.ts:165`
- Translation: `app/api/translation/vision-extract/route.ts:259` (+ `[sessionId]/ocr-from-storage/route.ts:164`)
- Re-Parole: `app/api/reparole/ocr/extract/route.ts:138`
- EAD: `app/api/ead/ocr/extract/route.ts:136`
- (separate engine path: `lib/engine/preprocess.ts:23` returns only `{image,mime,applied}` — different function, presence path)

**quality_fields_available** — `PreprocessResult` (`lib/ocr/image-preprocess.ts`):
- `quality.brightness` (0–255), `quality.blurScore` (Laplacian stdev; higher=sharper),
  `quality.assessment` ('good'|'acceptable'|'poor'), `quality.warnings[]`
- `resized` (bool), `scaleFactor` (<1 if shrunk), `width`, `height`
- `PreprocessError.code`: `too_blurry`/`too_dark`/`too_bright`/`too_small`/`corrupt_image`/`unsupported_file_type`
- **NOT present:** any rotation/EXIF flag. `.rotate()` is applied silently (:85) but whether
  a rotation occurred is NOT reported. **possible_handwritten:** NO detector anywhere.

**quality_reaches_reader: NO** — `readDocument(imageBuffer, mimeType, docTypeId, opts)` with
`opts = {provider, timeoutMs, attemptsPerModel}` (`documentFieldReader.ts:24-28`). The routes
pass the preprocessed BUFFER but drop the `quality` object. `documentFieldReader` has zero
references to blur/quality/rotation.

## Recommended contract

```
// additive, optional — passed via readDocument opts
interface DocumentRuntimeSignals {
  low_quality_scan?: boolean       // derived: assessment==='poor' OR blur below threshold
  blur_score?: number              // PreprocessResult.quality.blurScore (raw, for calibration)
  assessment?: 'good' | 'acceptable' | 'poor'
  oversized_resized?: boolean      // PreprocessResult.resized
  rotated_input?: boolean          // NOT AVAILABLE today — needs preprocess to report it
  exif_rotation_applied?: boolean  // NOT AVAILABLE today — same
  possible_handwritten?: boolean   // NO detector — do NOT synthesize
  source: 'preprocessImage' | 'route' | 'manual'
}
```

Honesty: only `blur_score`, `assessment`, `low_quality_scan`, `oversized_resized` are
derivable from today's `PreprocessResult`. `rotated_input`/`exif_rotation_applied` require a
small change to `image-preprocess.ts` to REPORT rotation (it currently applies it silently).
`possible_handwritten` has no source — left undefined, never fabricated.

## How the gate should use signals

- **Class allowlist stays PRIMARY** (handwritten birth classes always force identity review).
- **low_quality_scan = SECONDARY trigger**: alone it forces review on identity-critical fields
  ONLY (never changes values), with reason `low_quality_scan`.
- **rotated_input alone is NOT hard-case** — only escalate if paired with a quality warning or
  model instability (and the signal isn't even available yet).
- **NO blanket `unknown_document` force.**
- Thresholds (blurScore cutoff) are UNCALIBRATED — no verified GT → start conservative + flag-gated.

## Options

| Option | complexity | 4-product coverage | over-trigger risk | rollback | tests |
|---|---|---|---|---|---|
| A thread quality into `readDocument` opts | low (additive opt; routes already hold `pre`) | ALL 4 (one door) | low (flag-gated + identity-only) | flag OFF | gate uses signals; OFF=identical |
| B route-level gate before readDocument | medium | per-route (re-introduces the 4× duplication we just removed) | medium | per-route | 4× |
| C store quality in provenance only, no behavior | low | n/a | none | n/a | provenance only |
| D do nothing until GT | none | none | none | n/a | none |

```
recommended_option: A — thread an optional DocumentRuntimeSignals through readDocument opts,
  consumed by the gate, behind a dedicated RUNTIME_QUALITY_SIGNALS_ENABLED flag (default OFF)
  AND only acted on when ANTI_FABRICATION_GATE_ENABLED is on. The 4 routes already compute
  `pre` right before readDocument, so wiring is a small additive change at the one door —
  keeps the "one brain" shape and covers all 4 without the route-level duplication of B.
why: signal exists, door exists, additive + flag-gated, no behavior change when OFF.
rollback: RUNTIME_QUALITY_SIGNALS_ENABLED=OFF (and/or ANTI_FABRICATION_GATE_ENABLED=OFF).
```

## Risks

| Risk | Control |
|---|---|
| Blur threshold uncalibrated (no GT) → over-review | flag-gated, conservative cutoff, identity-only, raises review never changes values |
| Claiming rotation detection we don't have | rotated_input marked NOT AVAILABLE; needs preprocess to report rotation first |
| Re-introducing route duplication (B) | choose A (single door) |
| Synthesizing a handwritten signal | possible_handwritten left undefined — never fabricated |

## Tests planned (when implemented)

- flags OFF → byte-identical.
- signals plumbed but ANTI_FABRICATION_GATE_ENABLED OFF → no behavior change.
- gate ON + low_quality_scan=true on a non-allowlist doc → identity fields review_required=true, values unchanged, reason `low_quality_scan`.
- gate ON + good-quality printed doc → NOT forced.
- rotated_input alone (once available) → not forced without quality/instability.
- all 4 routes pass signals into readDocument (coverage).

## What is NOT done

No code. No flag enabled. No prod env. No model change. No self-consistency. P2.4/P2.5 frozen.
`rotated_input`/`possible_handwritten` not derivable yet. Thresholds uncalibrated (no GT →
accuracy not claimed).

## Next action

Owner approves contract + `RUNTIME_QUALITY_SIGNALS_ENABLED` (default OFF), then a small code
step: (1) optionally make `image-preprocess` report rotation; (2) add the optional opt to
`readDocument`; (3) have the 4 routes pass `pre.quality`; (4) gate consumes `low_quality_scan`.
