# Ground-Truth Templates (versioned, PII-free)

These are **empty** schema templates for P2 (`SMART_NORMALIZE_ENABLED`) accuracy
measurement. They contain **no real values and no images** — safe to commit.

## Why these live here

The filled ground-truth (real names, places, dates) and the source images are
**PII** and are **gitignored** under `test-fixtures/real-docs/` (`.gitignore:60`).
We never commit filled ground-truth or document images. Only these blank
templates are versioned, so the schema is reviewable and the owner has a known
starting point.

## How the owner uses them

1. Copy a template to a local, gitignored location:
   - `test-fixtures/real-docs/ground-truth/<name>_<surname>.json`, or
   - `qa-private/ground-truth/<name>.json`
2. Open the physical document / fixture image and type the EXACT value into each field.
3. Leave a field `""` if it is genuinely not present on the document.
4. Set `_meta.ground_truth_status` to `VERIFIED_BY_OWNER`.
5. Keep the filled file local — **do not commit it**.

## How P2 delta is measured (after the owner fills)

Run the P2-relevant fixtures through the live pipeline twice —
`SMART_NORMALIZE_ENABLED=OFF` vs `ON` — and compare each field against the
filled ground-truth. Report per field: OFF-correct / ON-correct / delta.
That is the first real proof of "better" (not just "did not crash").

## Templates

| Template | Document class | P2-relevant fields |
|---|---|---|
| `birth_cert_soviet.template.json` | birth_certificate (bilingual UA/RU, handwritten) | place_of_birth, patronymic, settlement_type |
| `birth_cert_handwritten.template.json` | birth_certificate (handwritten) | place_of_birth, patronymic, issuing_authority |
| `military_id_p1.template.json` | military_id (page 1) | issuing_authority, patronymic |
