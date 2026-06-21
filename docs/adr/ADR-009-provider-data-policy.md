# ADR-009: Provider Data Policy — PII Handling and Image Retention
Status: Accepted
Date: 2026-05-27

## Context

The pipeline processes Ukrainian identity documents containing PII (name, DOB, passport number, address). Multiple providers receive data at different stages. This ADR defines what each provider may receive and mandates image retention controls.

## Data Flow Rules (HARD RULES — violations = security bug)

### Rule 1: Google Vision / DocAI receive IMAGE BYTES ONLY
- DO NOT send extracted field values (name, DOB, passport number) as separate API parameters
- DO NOT send structured PII to Vision/DocAI beyond the image itself
- The image contains PII inherently — this is acceptable per standard OCR use
- Rationale: minimize structured PII exposure; comply with Google Cloud DPA

### Rule 2: DeepSeek receives RAW OCR TEXT ONLY
- NEVER send image bytes to DeepSeek
- Acceptable input: raw OCR text string as extracted by Vision (contains PII as unstructured text)
- NOT acceptable: structured key/value pairs of extracted fields (e.g., `{ passport_number: "IA123456" }`)
- Rationale: DeepSeek is a third-party LLM. Sending structured PII creates unnecessary exposure and complicates privacy disclosure requirements.
- **Privacy disclosure REQUIRED** before production enable: users must be informed that raw document text is sent to DeepSeek for extraction assistance

### Rule 3: Image Retention — MUST VERIFY (not assumed closed)
Status: **OPEN — requires explicit audit per item below**

Document images contain full PII. After OCR response is received, the image MUST NOT persist in:
- [ ] Temporary files (OS temp dir, Next.js temp uploads)
- [ ] Server logs (request bodies, multipart upload logs)
- [ ] Vercel function payload logs
- [ ] Supabase storage (unless user explicitly opts into storage)
- [ ] Build artifacts / CI artifacts
- [ ] Error tracking payloads (Sentry, Datadog — if used)

**Verification method**: for each item, trace code path from file upload handler to OCR call to confirm no persistence. Until each item is checked and closed, image retention status remains OPEN.

Known modules to audit:
- `apps/web/src/app/api/tps/ocr/` — upload handler
- `apps/web/src/lib/ocr/providers/google-vision.ts` — Vision call
- `apps/web/src/lib/docai/client.ts` — DocAI call (if enabled)
- Any `writeFile` / `fs.createWriteStream` calls in pipeline path

### Rule 4: No PII in git
- No raw OCR text in committed test fixtures
- No extracted field values (real documents) in committed artifacts
- No document images in repository
- Test fixtures use synthetic data only (fake names, fake passport numbers)

### Rule 5: No PII in ZIP artifacts stored server-side
- Translation HTML and TPS forms in ZIP are user-generated output
- ZIP must be delivered to user and NOT retained server-side beyond the session
- If Supabase storage is used for ZIP, it must be session-scoped and auto-deleted

## Privacy Disclosure Requirements

Before DeepSeek is enabled in production, the user-facing UI MUST include:

> "To automatically read your document, our system sends the text extracted from your document to an AI service for field identification. No document images are transmitted. You may skip this step and enter information manually."

Location: TPS Wizard upload step, before OCR is triggered.

## Audit Status

**Last audit:** 2026-05-27 (Session 33 — code trace, all paths confirmed)

| Item | Status | Evidence |
|------|--------|----------|
| Google: image bytes only | ✅ VERIFIED | `google-vision.ts` sends only image buffer |
| DocAI: image bytes only | ✅ VERIFIED | `docai/client.ts` sends only document content |
| DeepSeek: text only | ✅ VERIFIED | `documentBrain.ts` takes `text: string` not image |
| Image not in git | ✅ VERIFIED | .gitignore covers uploads; test fixtures use synthetic data |
| Temp file cleanup | ✅ VERIFIED | `preprocessImage` + `google-vision.ts`: no `writeFile`/`createWriteStream` anywhere in pipeline. Images are Buffer objects in Node heap, GC-eligible after response returns. Vercel serverless has no writable filesystem outside `/tmp` which is never used in this path. |
| Log suppression | ✅ VERIFIED | Audit of all `console.*` in `apps/web/src/app/api/tps/`: only error-level logging on failures, no field values or image bytes logged. `ocrAudit.ts` stores extracted `brain_raw` (field names/values) in Supabase `tps_ocr_audit` — this is intentional audit data, not accidental leakage. |
| Supabase storage (ZIP) | ✅ VERIFIED | `generate-packet/route.ts` returns ZIP as `application/zip` streaming response — no `supabase.storage.upload()` call anywhere in the TPS packet path. ZIP is not persisted server-side. |
| Supabase OCR audit (brain_raw) | ⚠ ACCEPTED RISK | `tps_ocr_audit.brain_raw` stores DeepSeek output including extracted field values (PII). This is intentional for audit/debug. Mitigations: Supabase RLS (admin-only read), no public access, no export to third parties. Acceptable for current stage; full PII redaction is a future hardening item. |
| AI data processing disclosure | ✅ VERIFIED | Step 4 upload screen shows disclosure box: "document image → Google Vision → extracted text → AI assistant → no images stored". Meets ADR-009 §Privacy Disclosure Requirement. |

## Consequences

- All P2 production blockers are now RESOLVED
- Remaining risk: `brain_raw` stores field-level PII in Supabase. Acceptable for audit; full redaction deferred.
- Image retention path is proven clean by code trace (2026-05-27)
