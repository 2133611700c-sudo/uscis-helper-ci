# ADR-015 — PDF Output Architecture (Document Output Engine)

**Status:** Accepted (spike-validated) · 2026-05-29
**Context:** One flat PDF template cannot serve all document types. We need a
PDF "factory" that selects the right template by document type, and a clear split
between official USCIS forms and bureau-style certified translations.

## Decision

### Two separate output tracks (never mixed)
| Track | Renderer | Input → Output |
|---|---|---|
| **A. Official USCIS forms** (I-821/I-765/I-131/I-912) | **pdf-lib** (fill existing AcroForm fields) | official USCIS PDF + verified fields → filled form |
| **B. Bureau-style certified translation** (UA doc → English) | **pdf-lib `renderOfficialTranslation`** (existing, schema-driven) | OfficialFormSchema + verified English values → certified translation PDF |

### React-PDF / Puppeteer / Apple — REJECTED as core
- **React-PDF: NOT adopted.** The motivation would have been golden text-readback
  tests. **Spike proved it is unnecessary** (`bureau-readback.spike.test.ts`): the
  existing pdf-lib `renderOfficialTranslation` uses StandardFonts for English output,
  which is stored as `<hex> Tj` and **fully extractable** — golden text readback works
  today. The earlier readback failure was specific to the LIVE flat `pdf.ts`, which
  embeds a TTF subset for Cyrillic values (glyph-encoded). The bureau renderer (English,
  standard fonts) does not have that problem. → No new renderer/dependency.
- **Puppeteer/Chromium: NO** — heavy + unstable on Vercel serverless. Fallback worker only, if ever.
- **Apple PDFKit / macOS Preview: NO** — QA / local / future client app only, never the server engine. Production is Vercel/Linux; output must be deterministic off-Mac.

## Spike evidence (2026-05-29)
`renderOfficialTranslation(birthCertificateSchema, values)` → PDF → hex-decoded readback:
```
BIRTH CERTIFICATE
CHILD  Surname: Ivanenko  Date of birth: 01 January 1990
       Place of birth: Trostianets (urban-type settlement)  Region (Oblast): Vinnytsia Oblast
       Given name: ____ [enter from document]   ← honest MISSING, not dropped
STATE REGISTRATION  Place of state registration: Civil Registry Office  Series and No.: I-AM 000001
```
Bureau layout ✓ · honest MISSING placeholders ✓ · fully text-extractable ✓.

## Real remaining work (the actual gaps — NOT a new renderer)
1. **Field-key mapping** (recognized fields → schema keys). The spike confirmed a real
   gap: recognition emits `child_full_name`/`family_name`, the schema expects
   `child_surname`/`child_given_name`. A mapping layer per doc type is required before
   wiring the bureau renderer live.
2. **Document Registry** — select the schema/template by `documentType` (+ variant/era).
   Reuse `engine/docTypes.ts` + `docintel/documentRegistry.ts`; do not rebuild.
3. **Source Registry** — already exists (`D-GLOSSARY` registry `source_url` +
   `docs/official-forms/ukraine/source-ledger.json`). Extend, don't recreate.
4. **Wire `renderOfficialTranslation` into the live `generate-pdf`** behind a flag
   (default OFF), with golden text-readback tests per schema, and **owner visual
   approval before enabling** (it changes the signed document).

## Sequencing
After PR #26 (+#27 KOATUU) merge: field-key mapping → Document Registry wiring →
golden tests per schema → owner visual approval → enable per doc type. The signed
document is never changed silently.

## Consequences
- No new rendering dependency; one engine (pdf-lib) for both tracks; deterministic on Vercel.
- Golden tests are feasible today on the bureau renderer (hex-decode readback).
- The factory's hard part is field mapping + template selection, not rendering.
