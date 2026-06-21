# DOCUMENT_CLASS_EXTRACTION_MATRIX

Date: 2026-06-03
Scope: actual runtime extraction coverage, not design intent

## Matrix

| Document / behavior | TPS | Translation | Re-Parole | EAD | Actual status |
| --- | --- | --- | --- | --- | --- |
| Ukrainian internal passport booklet | Core for `booklet` when `ONE_CORE_TPS_ENABLED=1`, else legacy booklet path | shared docintel path; optional Core arbitration path | Core route only when UI+server flags on | Core route only when UI+server flags on | shared but not uniform |
| Ukrainian international passport | Core for `passport` when flag on, else legacy passport path | shared docintel path; optional Core arbitration path, no MRZ authority | Core route with MRZ injection when flags on | Core route, no MRZ injection | shared but inconsistent |
| Ukrainian military ID | legacy TPS module only | no live OCR route found | no dedicated path found | no dedicated path found | bypasses shared Core |
| Ukrainian birth certificate | legacy TPS module only | shared docintel path for `ua_birth_certificate`; no schema-driven extraction proof | no dedicated Re-Parole route path found | n/a | split and incomplete |
| Rotated birth certificate | TPS: legacy birth cert module has no route-level rotation branch specific to birth cert; only generic preprocess | Translation: per-page `preprocessImage` before `readDocument` | no route proof | n/a | only Translation has explicit current route handling |

## Required Cyrillic Check

### Internal passport

Runtime handling present:

- docintel shared registry entry: `ua_internal_passport_booklet`
- TPS old path also has legacy `runPassportBookletModule`
- Translation reads it through `readDocument()`
- Re-Parole and EAD can read it only on Core feature-flag path

Status:

- partially unified, still dual-path

### International passport

Runtime handling present:

- docintel registry entry: `ua_international_passport`
- TPS old path has legacy `runPassportModule`
- Core MRZ injection exists in TPS and Re-Parole only

Status:

- partially unified, MRZ uneven

### Military ID

Runtime handling present:

- TPS legacy `runMilitaryIdModule`

Not present in shared registry:

- no `ua_military_id` in `docintel/documentRegistry.ts`

Status:

- not on shared Core/docintel registry path

### Birth certificate

Runtime handling present:

- TPS legacy `runBirthCertificateModule`
- Translation `docTypeId=ua_birth_certificate` can use shared `readDocument()`

Missing proof:

- no shared schema-driven Core extraction
- no `CanonicalDocumentResult` birth-certificate route in TPS/Translation/Re-Parole

Status:

- split between legacy TPS and generic shared docintel

### Rotated birth certificate

Source proof:

- Translation route preprocesses and normalizes images before `readDocument()`
- TPS route contains explicit rotation retries for passport, booklet, i94, ead, dl, but not birth certificate

Status:

- Translation has direct route support
- TPS birth certificate remains dependent on generic preprocess only

## Document Class Policy Coverage

`documentClassPolicy.ts` declares:

- `internal_passport_booklet`
- `military_id`
- `birth_certificate_handwritten`
- `birth_certificate_soviet_bilingual`
- `marriage_apostille`
- `unknown_document`

Actual route coverage:

| Policy class | TPS route | Translation route | Re-Parole route | EAD route |
| --- | --- | --- | --- | --- |
| internal_passport_booklet | yes | yes | no | no |
| military_id | yes | no proof of route use | no | no |
| birth_certificate_handwritten | yes | yes | no | n/a |
| birth_certificate_soviet_bilingual | yes via conservative mapping | yes via conservative mapping | no | n/a |
| marriage_apostille | no TPS route proof | yes | no | n/a |
| unknown_document | only indirectly via helper return | only indirectly via helper return | no | no |

## Core Coverage by Product and Doc Class

### Truly on shared Core/docintel/arbitration path

- internal passport booklet: Translation, Re-Parole flag path, EAD flag path, TPS flag path
- international passport: Translation, Re-Parole flag path, EAD flag path, TPS flag path

### Not truly on shared Core/docintel/arbitration path

- military ID
- TPS birth certificate
- Re-Parole `i94`, `ead`, `dl`
- TPS `i94`, `ead`, `dl`, `i797`, `tps_notice`, `i797_or_ead`, `ead_old`

## Bottom Line

The extraction matrix disproves the claim that one central Document Core is already serving all relevant document classes across the four products.

Best-supported shared classes:

- internal passport booklet
- international passport

Still outside the shared Core in practice:

- military ID
- TPS birth certificate path
- multiple Re-Parole and TPS non-passport slots
