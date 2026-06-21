# Passport Translation — Internal Manual QA Checklist

**For operator use only. Complete before releasing any PDF to a pilot user.**

---

## Session Information

- **Pilot user ID:** ___________  (P001 / P002 / P003)
- **Session ID:** ___________
- **Date reviewed:** ___________
- **Operator:** ___________

---

## Section A — Session Integrity

- [ ] Correct `session_id` recorded and matches the PDF render request
- [ ] Document type is Ukrainian internal passport booklet (`ua_passport_internal`)
- [ ] `ocr_completed` audit event exists for this session
- [ ] All 11 critical fields present in `extracted_fields` table or explicitly flagged `review_required`

---

## Section B — Field Accuracy (check against physical document if available)

- [ ] All 11 fields confirmed or corrected by the user (none left unconfirmed)
- [ ] Passport **series** checked — 2 Cyrillic letters match physical document
- [ ] Passport **number** checked — 6 digits match physical document
- [ ] **Date of birth** checked — day and month are not swapped, year is correct
- [ ] **Date of issue** checked — day and month are not swapped, year is correct
- [ ] **Surname** spelling checked against user-confirmed spelling
- [ ] **Given name** spelling checked against user-confirmed spelling
- [ ] **Patronymic** checked if present; absent entry acceptable if field was empty
- [ ] **Place of birth** checked — transliteration is reasonable
- [ ] **Issuing authority** resolved correctly (see Section C)

---

## Section C — Issuing Authority Era Rules

- [ ] Pre-2015 document: issuing authority does **NOT** read "Police" — must read "Militia Department", "District Department of the Ministry of Internal Affairs", or similar
- [ ] ДМС / УДМС / ГУДМС resolved to "State Migration Service of Ukraine" (not left as Cyrillic abbreviation)
- [ ] НПУ / УНП / ГУНП are acceptable only for documents issued after July 2015
- [ ] МВД stays "Ministry of Internal Affairs" — not modernized to Ukrainian МВС label

---

## Section D — Customer PDF Cleanliness

- [ ] No text reading "SOURCE TRACE" anywhere in PDF
- [ ] No text reading "QA/Audit", "audit record", "internal", or "debug"
- [ ] No raw JSON, curly braces with key-value pairs visible
- [ ] No OCR IDs (e.g. `w_0001`, `w_0042`), bounding box coordinates, or confidence scores
- [ ] No `ocr_id`, `bbox`, `confidence`, or `review_required` visible in customer PDF
- [ ] No text reading "CERTIFIED COPY", "Round seal", or "Uploaded image"
- [ ] No text reading "Translator Note" in an unauthorized position
- [ ] PDF is exactly **2 pages**: Page 1 = Translation fields + disclaimer, Page 2 = Certification

---

## Section E — Legal Compliance

- [ ] No wording claiming "USCIS accepted" or "will be accepted"
- [ ] No wording claiming "guaranteed" acceptance or result
- [ ] No wording claiming "certified by AI" or "AI-certified"
- [ ] Certification block **is present** and complete (translator name, date, statement)
- [ ] Disclaimer present: confirms translation is for reference, not legal advice

---

## Section F — Readability

- [ ] PDF opens and is readable on mobile phone (test with your phone)
- [ ] PDF opens and is readable on desktop
- [ ] All field values are legible (no truncation, no overlapping text)
- [ ] No missing fonts or rendering artifacts

---

## Section G — Audit Log Spot-Check

- [ ] Check last 10 audit events for this `session_id` in Supabase `audit_logs` table
- [ ] No raw field values (names, passport numbers, dates) in `metadata` column
- [ ] `certification_completed` event stores `signer_name_length` (integer), not raw name
- [ ] `field_corrected` events store `value_length` (integer), not raw corrected value
- [ ] `final_rendered` event exists with `storage_key` and `file_size_bytes`

---

## Final Decision

Select one:

**[ ] APPROVE FOR PILOT DELIVERY**
> All checks above passed. PDF is clean, accurate, and safe to deliver.

**[ ] HOLD FOR USER CORRECTION**
> Reason: _________________________________
> Action: Contact user to re-check and re-confirm field: _________________________________

**[ ] HOLD FOR TECH FIX**
> Reason: _________________________________
> Action: Escalate to engineering. Do not deliver PDF until fix is confirmed.

**[ ] REJECT / MANUAL REVIEW REQUIRED**
> Reason: _________________________________
> Action: Document type not supported, or session data is too incomplete to certify safely.

---

**Operator signature / initials:** ___________  
**Decision date/time:** ___________
