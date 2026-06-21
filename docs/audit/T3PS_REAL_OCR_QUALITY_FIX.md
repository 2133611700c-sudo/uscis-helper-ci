# T3PS — Real-Document OCR Quality Fix

**Date:** 2026-05-19
**Production SHA:** `a8b26e21d3`
**Status:** **PARTIAL_OCR_QUALITY_GAP** — DOB and country fixed, source labels and humanization gaps remain.

---

## Root-cause analysis (independent engineering view)

Three distinct problems reported by Taras on his real passport upload:

### 1. DOB null on every real passport

Google Vision was reading the date just fine — the failure was downstream
in `validateBrainField`. The validator delegates to `parseDate`, which
historically accepted only `YYYY-MM-DD` and `MM/DD/YYYY`. Real-world
passport date formats look nothing like that:

- Ukrainian passport visual zone: `01.01.1985` (DD.MM.YYYY with dots)
- USCIS letters / older USCIS docs: `01 JAN 1985`
- MRZ TD3 birth slice: `850101` (YYMMDD)

The Brain dutifully extracted whichever it saw, validator returned
`'date not parseable'`, the field landed in `brain.validated_skipped[]`,
and the wizard rendered `—`.

### 2. country_of_nationality = "Ukraina"

No country normalizer existed anywhere in the TPS pipeline. The Brain
returned the raw OCR token. For USCIS forms we need a canonical English
country name.

### 3. Source labels were misleading

The wizard's review table (`RW()` in `TPSWizardV2.tsx`) hardcodes a
source string per field name — `'Паспорт → OCR'` for every passport
field, `'I-797 / EAD → OCR'` for address fields, etc. It never
inspected `extraction_source` on the actual field, so when Brain
populated a value the UI still claimed it came from the passport.
Combined with merging fields from multiple documents (a real session
typically has passport + EAD), labels became confusing.

(The reported `a_number: "000-000-000"` on what looked like a passport
session is actually correct — wizard merges uploads, so the A-number
came from the EAD upload that Taras also did. The mislabel was the
real bug.)

## Fixes shipped (commit `a8b26e2`)

`parseDate()` now accepts:

| Format | Example | Notes |
|---|---|---|
| ISO | `1985-01-01` | Brain canonical |
| US | `01/01/1985`, `1/1/1985` | USCIS canonical |
| European/UA | `01.01.1985`, `1.1.1985` | unambiguous (dots) |
| Slashed European | `15/03/1985` | disambiguated when DD > 12 |
| Visual | `01 JAN 1985`, `1-Jan-1985` | month abbreviations |
| MRZ TD3 birth | `850101` | century resolved (YY > currentYear+10 ⇒ 19YY) |

Every successful parse normalizes the field's `final_value` to USCIS
canonical `MM/DD/YYYY` in-place — downstream PDF prefill needs no
date-aware code.

`normalizeCountry()` introduced with a small alias table for Ukraine
variants (`ukr`, `ukraine`, `ukraina`, `ukrayina`, `україна`,
`украина` → `Ukraine`). Applied inside `validateBrainField` for
`country_of_nationality` and `passport_country_of_issuance`.

Seven new unit tests cover every parser path; full vitest suite for
the documentBrain module: 28/28 passed.

## Production proof

`POST /api/tps/ocr/extract` against the synthetic passport image
(`Date of Birth: 01 JAN 1985`, `Nationality: UKR`):

| Field | Before fix | After fix |
|---|---|---|
| `dob` | null | **`01/01/1985`** |
| `country_of_nationality` | `UKR` | **`Ukraine`** |
| `passport_country_of_issuance` | `UKR` | **`Ukraine`** |
| `final_field_count` | 6 | **7** |

`brain.validated_skipped` after fix: only
`passport_expiration_date` remains (synthetic image has no visible
expiration; real passport with visible expiration would parse).

Browser E2E (Playwright on Chromium, prod URL):

- Open wizard → click through Steps 1–3 → upload passport_mock.png on Step 4
- OCR responds 200, brain_status=ran, final_field_count=7
- Click "Распознать документы →" → Step 5 review screen renders:
  - Фамилия: Shevchenko
  - Имя: Taras
  - **Дата рождения: 01/01/1985**
  - Пол: M
  - Номер паспорта: FB1234567
  - **Гражданство: Ukraine**

(See `qa-shots/e2e-step5-review.png` for the screenshot.)

## What I did NOT yet fix (honest gap list)

| id | priority | impact |
|---|---|---|
| source_label_accuracy | P1 | wizard still labels every field "Паспорт → OCR" even when Brain produced it. Cosmetic but misleading; needs the wizard to surface `extraction_source`. |
| patronymic_explainer | P2 | empty patronymic row needs "не присутствует в этом документе" copy when document type is international passport |
| missing_field_humanization | P1 | `—` should be replaced with "Не найдено — введите вручную" and an inline edit affordance |
| a_number_normalizer | P2 | display can keep dashes; need to confirm packetBuilder strips them before writing to I-821/I-765 PDF fields |
| real_document_matrix | P0 | the proof above used a synthetic image. Taras's actual passport may have OCR-quality issues at the image layer (sharpness, glare, rotation) that Vision misses. Need redacted real-document matrix to close to GO. |

## Verdict per spec category

- **DOB:** PASS
- **Country:** PASS
- **A-number:** PENDING_REAL_TEST (synthetic doesn't reproduce the EAD upload case)
- **Labels / source:** FAIL (deferred — separate PR)
- **Browser flow:** PASS (Step 5 renders DOB and "Ukraine" correctly)
- **PDF / ZIP:** NOT_EXERCISED in this iteration (was green in prior T3PS closeout)

Overall: **PARTIAL_OCR_QUALITY_GAP**. Two P0 issues (DOB, country) are
fixed end-to-end. Two P1 items (source labels, missing-field humanization)
remain. Taras should re-test the wizard with his real documents to
confirm the date format on his passport parses through the new code.

## Next action

1. Taras re-uploads the same real documents at
   `https://messenginfo.com/ru/services/tps-ukraine` and confirms DOB
   shows up and citizenship reads `Ukraine`.
2. If anything is still missing, the new OCR response diagnostics
   (`brain_status`, `final_field_keys`, `brain.validated_skipped[]`)
   will identify exactly which field is the bottleneck without log
   diving.
3. Ship the P1 items (source labels + missing-field humanization) in a
   single follow-up PR.
