# Service Flow — Translate Document

Updated: 2026-04-30

## Goal

Turn translation into an action flow, not a link directory.

## Flow

1. User clicks `Translate Documents`
2. User selects document type:
   - Passport
   - Birth Certificate
   - Marriage Certificate
   - Divorce Certificate
   - Diploma / Transcript
   - Military Document
   - Driver License
   - Vaccination Record
   - Other
3. User uploads photo/PDF/scan
4. System extracts visible fields
5. User reviews and edits
6. System generates `Translation Draft` / `SAMPLE`
7. User downloads PDF or requests email copy
8. User sees official source rule

## Product Rule

- Do not call AI-only output `Certified Translation`.
- Use `Translation Draft`, `AI Translation Draft`, or `Draft for review`.
- Show translator-certification rule from 8 CFR 103.2(b)(3).

## Output

- English draft
- extracted fields preview
- missing fields note
- official source links

## Official Sources

- https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-103/subpart-A/section-103.2
- https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6
