# D1 — Readers (OCR/HTR/Vision)
**Mission:** produce field candidates + confidence + source zones. **Inputs:** image+docType. **Outputs:** per-reader candidates.
**Readers:** Google Vision/DocAI (printed baseline), Transkribus/PyLaia (handwriting; printed-only proven), Gemini/GPT-4o (auxiliary), googleVisionReader (OCR→lines→fields).
**Allowed:** ≥2 independent readers. **Forbidden:** single reader as truth-source (ADR-011); transliterating in the reader.
**Failure:** a reader that errors simply does not vote. **Audit:** each candidate logged. **Tests:** models.ts/htr.ts.
**Products:** all. **Impl:** apps/web/src/lib/engine/{models,htr}.ts + consensus.ts.
