# Decision: NO scanner-style tonal preprocessing (grayscale / B&W) before the vision read

Date: 2026-06-10
Status: DECIDED — backed by an A/B experiment on real owner Cyrillic docs.

## Question

Should we add a phone-scanner-style preprocessor — convert the photo to
black-and-white, enhance contrast, "extract only the quality data" — to make
Cyrillic easier to read before sending to Gemini?

## Experiment

For 3 real owner documents, three image variants were POSTed to the live prod
read (`/api/translation/vision-extract`, gemini-3.1-pro-preview) and scored on
Cyrillic field match vs owner GT:
- `orig` — color, only resized to ≤2400px (geometric, lossless-ish)
- `gray` — greyscale + normalise + sharpen (gentle enhance)
- `bw`   — greyscale + normalise + threshold(140) (hard 1-bit binarize)

## Result (Cyrillic name fields matched)

| document | orig (color) | gray+contrast | hard B&W |
|---|---|---|---|
| birth cert (handwritten) | **3/3** | **0/3** | **0/3** |
| military (printed) | 3/3 | 3/3 | 3/3 |
| internal passport booklet (handwritten) | (transient net error) | 2/3 | 2/3 |

On the **most dangerous class** (handwritten certificate) tonal preprocessing
collapsed Cyrillic accuracy from 3/3 to 0/3. On printed text it made no difference.

## Why (the trap)

- Classic OCR engines (Tesseract) benefit from binarization/contrast. Modern
  multimodal **vision LLMs are trained on natural photos** and read color/greyscale
  at least as well — often better.
- Thresholding **destroys faint handwriting strokes** — exactly the information the
  model needs on handwritten Cyrillic, which is already our hardest, fabrication-prone
  class. Removing information hurts where we can least afford it.
- Principle: preprocessing that **reorganizes** geometry (crop, deskew, EXIF rotate,
  resize-to-fit) is safe and can help; preprocessing that **removes tonal
  information** (greyscale, binarize, aggressive denoise) is harmful on hard cases.

## Decision

1. **Do NOT** add greyscale / black-and-white / threshold / "scan-clean" tonal
   preprocessing before the vision read. Send the original color image (only
   geometrically resized to clear the edge cap — already shipped).
2. A geometric **document crop / deskew / perspective** step MAY help (removes
   background, flattens the page, shrinks size) — but it must be **measured on the
   GT bench (incl. handwritten/Soviet danger classes) before shipping**, and must
   never drop tonal fidelity. Not built now; flagged as a measured candidate.
3. Note: the official PDF is generated from the EXTRACTED FIELDS (text), not from a
   scanned image — so "scan mode" would only ever affect read accuracy, which the
   data says it harms. No PDF benefit either.

## Caveat

Handwritten reads are non-deterministic (the same image scored 1/3 in one bench run
and 3/3 here) — which is itself why always-review on handwritten is mandatory. The
A/B comparison is valid because all three variants ran under the same conditions;
the orig-vs-processed gap is the signal, not the absolute number.
