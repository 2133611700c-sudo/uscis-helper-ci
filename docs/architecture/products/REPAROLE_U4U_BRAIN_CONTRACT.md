# Re-Parole U4U — Central Brain Contract
**Official basis:** USCIS Form I-131 (Application for Travel Document/parole); USCIS Re-Parole process for certain Ukrainian citizens (verify uscis.gov).
**Required docs:** passport, I-94, prior parole evidence, USCIS notices, current address.
**Required fields:** name, DOB, country of citizenship, passport number, prior parole dates, A-number (if any), address.
**Forbidden:** no blind reuse of TPS-specific rules; no separate isolated OCR pipeline; no final packet without source evidence; no guessing parole dates/A-number.
**OCR/HTR:** same central intake (D0–D2) as TPS/Translation; same consensus; same review.
**Translation:** only if a foreign-language supporting doc is attached → Translation contract applies.
**PDF:** I-131 packet via shared generator; readback proof.
**Audit:** shared ledger.
**E2E:** upload→intake→consensus→review→I-131 generate→readback.
**Migration:** Phase 5 Step 3 — replace standalone OCR path with central-brain adapter; keep generate-packet working.
