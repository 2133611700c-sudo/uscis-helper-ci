# Birth Certificate Translation Module — Planning Document

**Status:** PLANNING — no code yet
**Owner:** Messenginfo engineering
**Created:** 2026-05-09
**Prerequisites:** Passport module P001 pilot completed and post-pilot decision made (GO/NO-GO)

---

## Overview

Ukrainian birth certificates (свідоцтво про народження) are commonly required for USCIS filings — derivative asylum, U4U family members, citizenship applications, and family-based petitions. This document defines the field extraction scope, civil registry glossary requirements, and critical translation distinctions for the planned birth certificate module.

---

## Document types in scope

| Ukrainian name | Notes |
|---------------|-------|
| Свідоцтво про народження (new format) | Post-2000, A4 with hologram, colored background |
| Свідоцтво про народження (Soviet-era) | Pre-1991, УРСР format, differs in field layout |
| Актовий запис про народження | Act record — the underlying civil registry entry; different from the certificate issued to parents |

> **Key distinction:** The certificate number printed on the свідоцтво is NOT the same as the act record number (номер актового запису). USCIS officers sometimes request the act record number specifically. Both must be extracted if present.

---

## 14 Critical fields

| # | Ukrainian field name | English label | Notes |
|---|---------------------|--------------|-------|
| 1 | Прізвище дитини | Child's surname | May differ from parent surnames if pre-marriage birth |
| 2 | Ім'я дитини | Child's given name | |
| 3 | По батькові дитини | Child's patronymic | Optional in modern certs; always present in Soviet-era |
| 4 | Дата народження | Date of birth | Format: DD.MM.YYYY or spelled out in Ukrainian |
| 5 | Місце народження | Place of birth | City + region; pre-1991 may use USSR oblast names |
| 6 | Стать | Sex | М/Ч/Чоловіча = Male; Ж/Жіноча = Female |
| 7 | Прізвище батька | Father's surname | |
| 8 | Ім'я та по батькові батька | Father's given name + patronymic | |
| 9 | Прізвище матері | Mother's surname | Pre-marriage surname sometimes noted separately |
| 10 | Ім'я та по батькові матері | Mother's given name + patronymic | |
| 11 | Номер свідоцтва | Certificate number | Format: e.g., І-КВ №123456 or similar series |
| 12 | Номер актового запису | Act record number | Separate from certificate number — critical distinction |
| 13 | Орган РАЦС / ДРАЦСу | Civil registry office (issuing authority) | РАЦС = Soviet-era; ДРАЦС = post-reform |
| 14 | Дата видачі | Date of issue | Certificate issue date (not birth date) |

---

## Civil registry glossary requirements

### Issuing authority abbreviations

| Abbreviation | Ukrainian full | English rendering | Era |
|-------------|---------------|-------------------|-----|
| РАЦС | Відділ реєстрації актів цивільного стану | Civil Registry Office | Soviet / early post-Soviet |
| ДРАЦС | Державний реєстратор актів цивільного стану | State Civil Registry | Post-2016 reform |
| ВО РАЦС | Відділ організації РАЦС | Civil Registry Division | Soviet-era variant |
| МВС | Міністерство внутрішніх справ | Ministry of Internal Affairs | Soviet-era (some early certs) |

### Place-of-birth disambiguation

Soviet-era certificates use oblast names that no longer exist or have been renamed:
- Ворошиловградська → Луганська (renamed 1990)
- Дніпропетровська → Дніпропетровська (unchanged, but "Dnipropetrovsk" vs "Dnipro" city)
- Сталінська → Донецька (renamed 1961)
- Кіровоградська → Кропивницька (renamed 2016) — use historical name as printed, note in translation

**Rule:** Translate place names exactly as they appear in the document. Do NOT modernize historical oblast names. Add translator note if the place name has been officially renamed.

### Date formats in Ukrainian birth certificates

| Format seen in document | Parse rule |
|------------------------|------------|
| `15 березня 1992 року` | Spelled-out Ukrainian month — requires Ukrainian month lookup table |
| `15.03.1992` | ISO-adjacent numeric |
| `15/03/92` | Two-digit year — assume 19xx if year < 30, else 20xx |
| `п'ятнадцятого березня` | Genitive ordinal — rare, Soviet-era |

Ukrainian month genitive forms (required for spelled-out date parsing):

| Nominative | Genitive (as in documents) | English |
|-----------|--------------------------|---------|
| Січень | Січня | January |
| Лютий | Лютого | February |
| Березень | Березня | March |
| Квітень | Квітня | April |
| Травень | Травня | May |
| Червень | Червня | June |
| Липень | Липня | July |
| Серпень | Серпня | August |
| Вересень | Вересня | September |
| Жовтень | Жовтня | October |
| Листопад | Листопада | November |
| Грудень | Грудня | December |

---

## Act record number vs. certificate number — critical distinction

This is the most common error in Ukrainian birth certificate translations.

```
свідоцтво №  І-КВ 123456   ← Certificate number (видане батькам / issued to parents)
актовий запис №  789        ← Act record number (in civil registry book)
```

USCIS form instructions (e.g., I-130A, I-589) may specifically request the "act record number" or "book number." Both must be extracted separately. If the act record number is not visible on the certificate face (it may be on a stamp or back), mark as `extraction_confidence: low` with `review_required: true`.

---

## OCR challenges specific to birth certificates

| Challenge | Handling |
|-----------|----------|
| Holographic overlays on post-2000 certs | Google Vision handles; may reduce confidence on overlapping characters |
| Soviet-era handwritten fields | Handwriting detection flag needed; mark `confidence: low` automatically |
| Faded ink (pre-1970 certs) | Image preprocessing: contrast enhancement before Vision call |
| Dual-language fields (Ukrainian + Russian on Soviet certs) | Extract Ukrainian side first; note Russian variant in metadata |
| Surname change stamp (при одруженні) | Not in scope for initial release; mark as `requires_manual_review` |

---

## Certification block differences from passport module

Birth certificates require a different certification statement than passports:

**Passport certification (current):**
> "I, [name], certify that I am competent to translate from Ukrainian to English and that the above translation is true and accurate to the best of my knowledge and belief."

**Birth certificate certification (planned):**
> "I, [name], certify that I am competent to translate from Ukrainian to English and that the above is a true and complete translation of the Ukrainian birth certificate presented to me, to the best of my knowledge and belief."

This requires a new certification template variant — do not reuse `self_cert_8cfr_v1.ts` for birth certificates.

---

## Out of scope for initial release

- Divorce certificates (свідоцтво про розлучення)
- Death certificates (свідоцтво про смерть)
- Marriage certificates (свідоцтво про шлюб)
- Adoption certificates
- Certificates with court-ordered name changes

These are planned for future modules and share some infrastructure but need separate field maps and glossaries.

---

## Prerequisites before starting development

1. P001 passport pilot: GO decision received
2. Glossary infrastructure: `agencyGlossary.ts` pattern reused for civil registry glossary
3. Date parser: Ukrainian month genitive table implemented (can reuse from passport `born_date` field work)
4. At least 3 real anonymized birth certificate samples (new format + Soviet-era + handwritten)
5. Certification template variant approved by operator

---

## Estimated complexity vs. passport module

| Dimension | Passport | Birth Certificate |
|-----------|---------|-----------------|
| Critical fields | 11 | 14 |
| Field complexity | LOW | MEDIUM (dual numbers, dates) |
| OCR difficulty | MEDIUM | HIGH (handwriting, holograms) |
| Glossary size | ~40 entries | ~20 entries (simpler agencies) |
| Legal sensitivity | HIGH (travel doc) | HIGH (identity doc) |
| Estimated dev effort | (done) | ~1.5× passport effort |

---

## Next steps (in order)

1. Complete passport P001 pilot — collect QA result
2. Post-pilot GO decision from operator
3. Procure 3+ anonymized birth certificate samples
4. Extend `ukraine_agency_abbreviations.json` with РАЦС/ДРАЦС entries
5. Implement `birthCertificateFieldMap.ts` (mirrors `passportFieldMap.ts`)
6. Add Ukrainian genitive month parser (if not already in date utils)
7. Create `self_cert_birth_v1.ts` certification template
8. Build birth certificate OCR pipeline (reuse Vision + DeepSeek layer)
9. Write tests (at minimum: field extraction, act record number vs cert number, Soviet-era dates)
10. Pilot with 1–2 users before general release
