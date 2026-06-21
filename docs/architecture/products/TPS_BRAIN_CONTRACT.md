# TPS Ukraine — Central Brain Contract
**Official basis:** USCIS Form I-821 (TPS) + optional I-765 (EAD with TPS); current TPS-Ukraine guidance (verify uscis.gov).
**Required docs:** identity source (загранпаспорт MRZ / I-94 / EAD / DL / internal booklet), address proof, continuous-residence evidence.
**Source priority (identity):** controlling Latin (MRZ/I-94/EAD) > booklet OCR/HTR > manual.
**Required fields:** family/given name, DOB, passport number, A-number (if any), I-94 number, last entry date, status at entry, address, country of birth/nationality. **Optional:** patronymic, marital, phone/email (typed).
**Forbidden AI guesses:** A-number, I-94 number, any field without source evidence; no output if required USCIS fields missing.
**OCR/HTR:** Vision/DocAI printed; booklet handwriting → consensus + human; vision-LLM never sole truth.
**Review:** field+crop, uncertain→empty; readiness gate (readinessPolicy.ts).
**PDF:** I-821(+I-765) via pdf-lib, byte-readback proof, ZIP packet.
**Audit:** every field provenance logged.
**E2E:** upload→OCR→review→gate→generate→ZIP→PDF readback (Ivanenko/Trostianets/Vinnytsia confirmed).
**Migration:** LAST (Phase 5 Step 5) — move existing brain into common wrapper behavior-preserving; do NOT break.
