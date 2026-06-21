# P001 — QA Result

**Pilot user ID:** P001  
**Status:** PENDING — PDF not yet generated

---

## QA Checklist (to be completed after PDF render)

### Section A — Session Integrity
- [ ] Correct session_id recorded
- [ ] Document type is Ukrainian internal passport booklet
- [ ] `ocr_completed` audit event exists
- [ ] All 11 critical fields present or flagged `review_required`

### Section B — Field Accuracy
- [ ] All 11 fields confirmed or corrected by user
- [ ] Passport series correct (2 Cyrillic letters)
- [ ] Passport number correct (6 digits)
- [ ] Date of birth correct (day/month not swapped)
- [ ] Date of issue correct (day/month not swapped)
- [ ] Surname spelling correct
- [ ] Given name spelling correct
- [ ] Patronymic correct (or absent is noted)
- [ ] Place of birth transliteration reasonable
- [ ] Issuing authority resolved correctly

### Section C — Issuing Authority Era Rules
- [ ] Pre-2015 doc: NO "Police" in issuing authority
- [ ] ДМС/УДМС/ГУДМС → "State Migration Service of Ukraine"
- [ ] НПУ/УНП/ГУНП only for post-July 2015 docs

### Section D — PDF Cleanliness
- [ ] No "SOURCE TRACE" text
- [ ] No QA/Audit/internal/debug text
- [ ] No raw JSON or OCR IDs
- [ ] No bbox coordinates or confidence scores
- [ ] No "CERTIFIED COPY" / "Round seal" / "Uploaded image"
- [ ] PDF exactly 2 pages
- [ ] Forbidden phrase scan: 0 violations

### Section E — Legal Compliance
- [ ] No "USCIS accepted" / "guaranteed" / "certified by AI"
- [ ] Certification block present
- [ ] Disclaimer present

### Section F — Readability
- [ ] Opens on mobile
- [ ] Opens on desktop
- [ ] No truncated or overlapping text

### Section G — Audit Spot-Check
- [ ] No raw PII in audit_logs metadata
- [ ] `certification_completed` stores `signer_name_length` only
- [ ] `field_corrected` stores `value_length` only

---

## Final Decision

**[ ] PENDING** — PDF not yet generated.

---

*This file will be updated when P001 PDF is rendered and reviewed.*
