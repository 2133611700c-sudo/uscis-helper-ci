# D0 — Intake / Quality Control
**Mission:** gate quality, detect doc type + printed/handwritten, crop pages, request re-upload on bad input.
**Inputs:** uploaded file(s). **Outputs:** normalized image(s) + docType estimate + printed/handwritten flag.
**Allowed:** deskew, rotate, crop-to-document, contrast; plain-language re-upload guidance.
**Forbidden:** proceeding on a clearly bad photo; OCR here. **Failure:** ask re-upload (anti-loop, max retries → manual path).
**Audit:** log quality verdict. **Tests:** quality gate thresholds. **Products:** all. **Modes:** owner can bypass gate.
**Impl:** sharp (partial in TPS) — to centralize.
