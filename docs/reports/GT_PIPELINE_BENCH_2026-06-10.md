# GT Pipeline Bench — 2026-06-10 (live prod, gemini-3.1-pro-preview)

Measures the LIVE prod /api/translation/vision-extract per-field accuracy vs owner-verified GT.
Field names + match booleans only — NO personal values (those stay in gitignored qa-private).
Sample = 1 doc/class → **EXPLORATORY ONLY** per GT_BENCHMARK_EXIT_CRITERIA (<30/class). Direction, not canary approval.

## internal_passport_booklet (handwritten)
- http 200 · status `ok:core-b2` · model `gemini-3.1-pro-preview` · fields_returned 4 · downscaled from 4.1MB (>4MB edge limit)

| field | present | latin✓ | cyrillic✓ | review |
|---|---|---|---|---|
| family_name | ✓ | ✓ | ✓ | review |
| given_name | ✓ | ✓ | ✓ | review |
| patronymic | ✗ | ✗ | ✗ | — |
| dob | ✓ | ✓ | — | review |
| sex | ✗ | ✗ | — | — |

**Latin accuracy: 3/5 verified fields exact.**

## birth_certificate (handwritten)
- http 200 · status `ok:core-b2` · model `gemini-3.1-pro-preview` · fields_returned 10 · downscaled from 7.1MB (>4MB edge limit)

| field | present | latin✓ | cyrillic✓ | review |
|---|---|---|---|---|
| child_family_name | ✓ | — | ✓ | review |
| child_given_name | ✓ | — | ✗ | review |
| child_patronymic | ✓ | — | ✗ | review |
| dob | ✓ | ✗ | — | review |
| sex | ✗ | ✗ | — | — |

**Latin accuracy: 0/2 verified fields exact.**

## birth_certificate (Soviet bilingual)
- http 200 · status `ok:core-b2` · model `gemini-3.1-pro-preview` · fields_returned 10 · downscaled from 7.1MB (>4MB edge limit)

| field | present | latin✓ | cyrillic✓ | review |
|---|---|---|---|---|
| child_family_name | ✓ | — | ✓ | review |
| child_given_name | ✓ | — | ✗ | review |
| child_patronymic | ✓ | — | ✗ | review |
| dob | ✓ | ✗ | — | review |
| sex | ✗ | ✗ | — | — |

**Latin accuracy: 0/2 verified fields exact.**

## military_id_p1 (printed+hw)
- http 200 · status `ok:core-b2` · model `gemini-3.1-pro-preview` · fields_returned 5 · downscaled from 4.8MB (>4MB edge limit)

| field | present | latin✓ | cyrillic✓ | review |
|---|---|---|---|---|
| family_name | ✓ | ✓ | ✓ | review |
| given_name | ✓ | ✓ | ✓ | review |
| patronymic | ✓ | ✓ | ✓ | review |
| dob | ✓ | ✓ | — | review |
| sex | ✗ | ✗ | — | — |

**Latin accuracy: 4/5 verified fields exact.**

