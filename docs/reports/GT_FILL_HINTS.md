# GT Fill Hints — where each field usually sits on the blank (NO real values)

Structural guidance only. The TRUE values come from YOU reading the open image. Do not copy
from any model/OCR output (see refusal note at the bottom).

## Soviet birth certificate (`birth_cert_soviet_*`) — typical layout

- **Top block — the CHILD:** surname / given name / patronymic, then date of birth, then place of birth.
  → `family_name_cyrillic`, `given_name_cyrillic`, `patronymic_cyrillic`, `date_of_birth`, `place_of_birth_raw`.
- **Middle — parents** (often listed "Батько / Мати"): N/A for accuracy scoring (the birth-cert spec
  emits no parent fields) — fill only if you like.
- **Act record:** "Актовий запис №…" → `act_record_number`.
- **Bottom — issuing body + date + seal:** the civil-registry office name → `issuing_authority_raw`;
  the issue date → `issue_date`.
- Soviet forms are often **bilingual (UA + RU)** and handwritten in the value cells — transcribe exactly
  what is written (keep the с./смт/м. prefix on the place).

## Handwritten birth certificate (`birth_cert_handwritten_*`) — typical layout

- Same field set; values are **handwritten** → read carefully, transcribe the exact characters.
- Place of birth often includes a settlement-type prefix (с./смт/м.) — keep it in `place_of_birth_raw`.
- Issuing authority near the signature/seal → `issuing_authority_raw`.

## Formats (strict)

- Dates (`date_of_birth`, `issue_date`, `expiry_date`): **`YYYY-MM-DD`**.
- `sex`: **`M`** or **`F`**.
- Cyrillic fields (`*_cyrillic`, `*_raw`): exactly as written on the document.
- `*_latin` / `*_english`: optional — only if you want to pin the expected transliteration/translation.

## Unreadable fields

- Put **`null`** (not a guess) and add a line in `notes`, e.g. `"place: нечитаемо на скане"`.
  A `null` is correct GT — that field is excluded from the accuracy denominator, never counted as wrong.

## Minimum for the accuracy run

At least **4 identity fields** filled per file: pick from `family_name_cyrillic`, `given_name_cyrillic`,
`patronymic_cyrillic`, `date_of_birth`, `place_of_birth_raw`, `issuing_authority_raw`, `act_record_number`.
Then set `ground_truth_status: VERIFIED_BY_OWNER`.

## N/A on birth certs (won't be scored — don't worry about them)

`sex`, `province`, `passport_number`, `expiry_date`, `military_id_number` — the birth-cert spec emits no
such field; leave or fill, they are not part of the accuracy comparison.

## Two ways to fill

1. **Type directly** into the open JSON (`qa-private/ground-truth/birth_cert_*_*.json`) and set
   `ground_truth_status: VERIFIED_BY_OWNER`. Save.
2. **Dictate** the values — the intake helper `scripts/gt_intake.mjs` validates format and writes them +
   sets `VERIFIED_BY_OWNER` for you (see its header for usage). Either way the values are YOURS.

> Why the agent can't fill GT: on these documents the model returns a different person on each run
> (3 identities / 3 runs, verified). Taking any model output as "verified ground truth" would measure the
> gate against its own hallucination — mathematically circular. GT must come from a human who saw the
> original; it's a one-time owner investment that amortizes over every future accuracy run.
