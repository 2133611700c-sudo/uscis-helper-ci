# Ukraine Internal Passport (Booklet) — Translation Rules

**Module:** `ua_internal_passport_booklet`. Status: **active**, allowAutoPdf: **true**.
**Source of truth in code:** `apps/web/src/lib/translation/passport/passportBookletContract.ts`
plus `apps/web/src/lib/translation/modules/passportBooklet.module.ts`.

---

## 1. Critical Fields (11)

| Internal key | Display label (EN) | Source label (UK) |
|---|---|---|
| surname | Surname | Прізвище |
| given_name | Given Name | Ім'я |
| patronymic | Patronymic | По батькові |
| date_of_birth | Date of Birth | Дата народження |
| place_of_birth | Place of Birth | Місце народження |
| sex | Sex | Стать |
| passport_series | Series | Серія |
| passport_number | Number | Номер |
| issuing_authority | Issued By | Ким виданий |
| date_of_issue | Date of Issue | Дата видачі |
| document_type | Document Type | Паспорт громадянина України |

## 2. Extended Fields (3)

| Internal key | Display label (EN) | Source label (UK) |
|---|---|---|
| place_of_residence_registration | Registration of Place of Residence | Місце проживання |
| marital_status | Marital Status | Сімейний стан |
| identification_number | Identification Number | Ідентифікаційний номер |

## 3. Series and Number Protocol (v5 §12)

- Detect the full perforated sequence at the top/official identifier area.
- Split into **series** (2 letters) and **number** (6 digits) for legacy
  internal passport booklets.
- Read each digit independently; compare ambiguous digit shapes inside
  the same sequence (`digitShapeComparator.ts`). If two digits with
  similar shapes (3↔8, 5↔6, 0↔O) appear in the same sequence, both
  must be re-checked.
- Preserve the exact sequence; do NOT add punctuation, spaces, or
  "corrections" not present in the source.
- If any digit is uncertain after comparison, set `review_required=true`
  and block final rendering.

## 4. Date Zone Lock (v5 §11)

`dateFieldLockValidator.ts` enforces:
- date_of_birth ≠ date_of_issue (must be in different zones)
- date_of_issue ≠ valid_until
- Russian-month variants resolved against `RUSSIAN_MONTHS`/`UKRAINIAN_MONTHS`
  via `monthMapValidator.ts`.

## 5. Names and Identity Anchor (v5 §14)

If the user has a controlling Latin spelling from an international
passport, I-94, USCIS notice, or EAD — that spelling is the
`controlling_spelling` and is used verbatim across all translated
documents in the packet.

If no controlling Latin spelling exists, use official Ukrainian
transliteration (see `TRANSLITERATION_PRIORITY.md`) AFTER user review.
Never silently switch between transliteration variants in the same packet.

## 6. Historical Geography Lock (v5 §15)

For booklets issued before 2015:
- "МВС" / "міліція" stays "MIA" / "militia" — NOT "police".
- "Міське управління УМВС" stays as-is — NOT "City Police Office".
- "сільська рада" stays "village council" — NOT "city hall".

Forbidden modernisations enforced by `validators/passportBookletValidators` +
`SERVICE_CLAIMS_POLICY.md` forbidden-phrases list.

## 7. Stamps, Seals, Signatures (v5 §16)

- **Translate the readable text content of the seal**, not its shape.
- Never write "Round seal", "Square seal", "official stamp shape".
- If the seal text is unreadable, write `[seal text not legible]` and
  set `review_required=true`.

## 8. Empty Fields

Fields that are blank on the source MUST appear as `[blank]` in the
translation. Never invent a default.

## 9. Russian Duplicates

Old booklets contain bilingual Ukrainian/Russian entries. Use the
**Ukrainian** value as primary; collapse Russian duplicates into a single
translated value. Do not produce two parallel translations.

## 10. Rendering

`templates/passportBooklet.template.ts` (also routed through
`bureauStyleRenderer`). Output structure:

```
CERTIFIED ENGLISH TRANSLATION

UKRAINIAN INTERNAL PASSPORT (BOOKLET)

Series / Number:   <series> <number>
Surname:           <surname>
Given Name:        <given_name>
Patronymic:        <patronymic>
Date of Birth:     <date_of_birth>          (e.g. 12 May 1990)
Place of Birth:    <place_of_birth>
Sex:               <sex>
Issued by:         <issuing_authority>
Date of Issue:     <date_of_issue>          (e.g. 19 February 2003)

—— CERTIFICATION OF TRANSLATION ACCURACY ——
<8 CFR §103.2(b)(3) statement>

Translator:  <signer_full_name>
Signature:   ____________________________
Date:        <signed_at as 12 May 1990>
```

## 11. Acceptance Gate (before PDF render)

- 11/11 critical fields present OR review_required for the missing ones
- date_of_birth ≠ date_of_issue
- series matches `[A-ZА-Я]{2}` and number matches `[0-9]{6}`
- no Police/Police Department for pre-2015 issuance
- no source_trace, bbox, or ocr_id text in the PDF
- payment_confirmed=true and certification_record signed
