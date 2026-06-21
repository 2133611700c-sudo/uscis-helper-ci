# Model-Stability Finding — hard-case birth certificate

**Date:** 2026-06-04
**Doc under test:** `test-fixtures/real-docs/birth_cert_soviet_*.jpg` (faded, Soviet-era,
Russian-language handwritten/printed birth certificate — a hard case).
**Path:** `readDocument` (docintel, the prod Core door). `SMART_NORMALIZE_ENABLED` OFF
(measuring the model, not the dictionaries).
**Raw runs (PII):** `qa-private/reports/model-stability/` (gitignored — NOT committed).
**PII policy:** identities are represented by a SHA1 hash of
`family|given|patronymic|dob`; no names/dates printed here.

## Method

Same image, `readDocument` × 3 per requested model. The ACTUAL model served is taken
from the result `status` (the fallback chain can substitute a model; here each
requested model served itself). Identity = hash of the four identity fields.

## Results (raw-derived)

| requested model | runs | actual model | distinct identities | identity-field review flags |
|---|---|---|---|---|
| gemini-2.5-flash | 3 | gemini-2.5-flash | **2** (`028b503d`×2, `e1ff4038`×1) | family/given/patronymic/dob = **false** on all runs |
| gemini-3.5-flash | 3 | gemini-3.5-flash | **1** (`4015f678`×3) | dob = true; family/given/patronymic = false |

Note: `028b503d` (2.5-flash majority) and `4015f678` (3.5-flash) are also DIFFERENT
identities. The true identity is **UNKNOWN** — no verified ground truth exists for this
fixture, so this is a stability finding, not an accuracy finding.

## Answers (strict)

- **gemini-2.5-flash produces a different person on this doc:** **CONFIRMED** — 2
  distinct identities across 3 runs of the identical image.
- **gemini-2.5-flash returns review=false on the differing identity:** **CONFIRMED** —
  all four identity fields were emitted with `review_required=false` on every 2.5-flash
  run, including the runs that disagreed.
- **gemini-3.5-flash is more stable on the same document:** **CONFIRMED** — 1 identity
  across 3 runs (and it flags `dob` for review).
- **Which identity is correct:** **UNKNOWN** (no verified GT for this fixture).

## Recommendations (no code changed)

- **recommended_default_model:** for hard-case docs (handwritten / faded / Soviet /
  low-quality / rotated), do NOT let `gemini-2.5-flash` serve identity-critical reads
  without forced review. Prefer a stronger/steadier model (3.5-flash was stable here;
  3.1-pro-preview is the configured primary but 503'd under load). CHANGE warranted for
  the hard-case path; keep current default for clean printed docs (passport was stable
  and correct on all models).
- **hard_case_safety_rule:** `birth_cert_soviet` / handwritten / faded / low-quality /
  rotated ⇒ force `review_required=true` on identity fields unless verified by a
  stronger source (MRZ / a second model agreeing).
- **anti_fabrication_rule:** if identity differs between models or across runs ⇒ set
  `hard_case_model_instability=true` and force `review_required` on ALL identity fields.
  A confident (`review=false`) identity from a single hard-case read is unsafe.
- **SMART_NORMALIZE_ENABLED:** stays OFF until verified GT + a stability gate exist
  (OFF-vs-ON on real docs already showed zero dictionary delta — see
  `REAL_DOC_OFFON` note; the priority is the anti-fabrication gate, not the dictionaries).
- **P2.4 / P2.5:** remain frozen.

## Contrast — clean printed doc is fine

The international passport (`internal_passport_*.jpg`) read identically and correctly
across models/runs (`IVANENKO / TARAS / AA000000 / 1990-01-01`, review=false). The
instability is specific to the hard-case handwritten/faded certificate.
