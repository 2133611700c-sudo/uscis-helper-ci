# Official USCIS Form Edition Lock

Reference snapshot for the PDF templates the packet builders fill. USCIS instructs
filers to verify the **edition date printed at the bottom (footer) of every page of
the form**. This file records, per form, the current official edition + page count +
SHA-256 vs the repo template, so a future edition change is caught before
field-by-field form validation (Phase 2B).

**Source of truth = the footer string `Form I-xxx Edition MM/DD/YY` read from EVERY
page of the freshly downloaded official PDF** — NOT a web search snippet, NOT HTTP
metadata, NOT the file name, NOT the instructions, NOT a fee-schedule date. **No user
data; SHA-256 + edition dates + page counts only.**

## Per-page footer evidence (verified 2026-06-13, re-download from uscis.gov)

| Form | Official footer edition | Official pages (all same edition) | Official SHA-256 | Repo footer edition | Repo pages (all same edition) | Repo SHA-256 | Edition verdict |
|---|---|---|---|---|---|---|---|
| I-821 | **01/20/25** | 13 / 13 | `d6281d7ee4699228744e2cee80590d222d92a6c9e87eb86d657f0cd683ea91d3` | **01/20/25** | 13 / 13 | `44efaa06067eb78b024493bda388d17c214eb3bdbb204a516b0a1a1bf8521cda` | **MATCH** |
| I-131 | **01/20/25** | 14 / 14 | `e177bbae35c3df634e7269f1094c93a11c6edf6849fa5fe66fbe3726498d59b5` | **01/20/25** | 14 / 14 | `86f832d4b58d8b5e81821bf51bfb5d5a132db135aa7d30b7e09eab9bbb10fb4d` | **MATCH** |
| I-765 | **08/21/25** | 7 / 7 | `9ac0eae287749d4c2dfa0a591f464cc2124c18647c10e999b59484f090e0dc7d` | **08/21/25** | 7 / 7 | `52759f499dc7e49a65fabe33c509bf450929a39349a9b1bc270e79ffe386dedb` | **MATCH** |

Extraction method (reproducible): `pdftotext -layout <pdf> - | grep -oiE "Form I-[0-9]{3}[A-Z]? *Edition *[0-9]{2}/[0-9]{2}/[0-9]{2,4}" | sort | uniq -c`. Each form returned exactly one distinct edition string repeated once per page (13×, 14×, 7×) — i.e. **every page carries the same edition**, with no instruction/fee/other-form date mixed in.

## Verdict: EDITION_MATCH_STRUCTURE_DIFFERENT (NOT BLOCKED_FORM_EDITION)

- **Edition (footer, every page): MATCH** for all three forms — official == repo.
- **Page count: MATCH** (13 / 14 / 7).
- **SHA-256: DIFFERENT** — explained by structure, not edition: `pdfinfo` reports both as `Form: XFA`, but the official download carries embedded JavaScript + USCIS's own compression, while the repo template is re-saved / AcroForm-normalized for named-field filling. A SHA difference at an identical per-page footer edition is therefore EXPECTED and is NOT a stale-edition signal.

### On the "04/01/24" web-index discrepancy
USCIS's public web index / search snippets for these PDFs can surface an OLDER footer
date (e.g. 04/01/24) than the file currently served at the form URL. That is a known
indexing lag and is **NOT** authoritative. The authoritative value is the footer inside
the file actually downloaded from `https://www.uscis.gov/sites/default/files/document/forms/<form>.pdf`,
read on every page — which on 2026-06-13 is 01/20/25 (I-821, I-131) and 08/21/25 (I-765),
matching the repo templates page-for-page.

### Re-check rule
If a future official download reports a per-page footer edition that does NOT match the
repo column above, that IS `BLOCKED_FORM_EDITION` — stop and replace the template before
any form-mapping change. Field-by-field I-821/I-131/I-765 validation (Phase 2B) runs only
on an edition that is footer-verified to match.

Repo template paths:
- I-821 → `apps/web/public/uscis/tps/i-821.pdf`
- I-131 → `apps/web/public/uscis/reparole/i-131.pdf`
- I-765 → `apps/web/public/uscis/tps/i-765.pdf`
