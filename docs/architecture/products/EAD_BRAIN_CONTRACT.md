# EAD / Work Permit — Central Brain Contract
**Official basis:** USCIS Form I-765 + official I-765 instructions; eligibility CATEGORY is controlled, never guessed (e.g. c08 asylum-pending, c19/a12 TPS, parole-based).
**Required docs:** identity (passport/I-94/prior EAD), category-supporting evidence (TPS approval, parole, pending asylum receipt).
**Required fields:** name, DOB, country, A-number (if any), I-94, eligibility category (selected by product rules), mailing address, SSN (if any).
**Forbidden:** no generic HTML-only output; no category guessing; no submit-ready output without user review; no standalone broken flow.
**OCR/HTR:** central intake; consensus; category chosen by rules from confirmed status, not AI.
**PDF:** real filled I-765 (not just worksheet) via shared generator; readback proof.
**Audit:** shared ledger.
**E2E:** category selection→fields→I-765 generate→readback.
**Migration:** Phase 5 Step 4 — replace HTML-only with brain + eligibility rules.
