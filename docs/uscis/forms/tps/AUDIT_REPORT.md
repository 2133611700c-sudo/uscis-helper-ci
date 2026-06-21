# TPS Forms Zero-Trust Audit

**Captured:** 2026-05-10
**Verification policy:** trust nothing — not the USCIS HTML, not curl, not pypdf, not the other helper. Cross-check every claim across at least two independent paths.

## Independent verification paths used

| Path | Tool | What it proves |
|------|------|----------------|
| A    | curl + HTML regex over uscis.gov form page | What USCIS publishes as "Edition Date" |
| B    | curl PDF download + pdftotext footer regex | What edition is stamped INSIDE the file we got |
| C    | Chrome MCP visual browse (human view)       | What a real user sees today |
| D    | SHA256 of two independent downloads         | The bytes are stable (no in-flight tampering) |
| E    | pypdf + pdfinfo (poppler) page count        | Two parsers agree on structure |
| F    | OMB number + Expires date on first page     | Form metadata internal consistency |
| G    | XFA vs AcroForm architecture detection      | Whether we can actually fill the form programmatically |

## Edition consistency matrix

| File              | Path A (page) | Path B (footer)              | Path C (browse)  | SHA stable | Result |
|-------------------|---------------|------------------------------|------------------|------------|--------|
| i-821.pdf         | 01/20/25      | Form I-821 Edition 01/20/25  | (not verified — same domain) | ✅ | **MATCH** |
| i-821instr.pdf    | 01/20/25      | Form I-821 Instructions 01/20/25 | —            | ✅ | **MATCH** |
| i-765.pdf         | 08/21/25      | Form I-765 Edition 08/21/25  | 08/21/25 (Edition Date dropdown) | ✅ | **MATCH** |
| i-765instr.pdf    | 08/21/25      | Form I-765 Instructions 08/21/25 | —             | ✅ | **MATCH** |
| i-765ws.pdf       | 08/21/25      | Form I-765WS Edition 08/21/25 | —              | ✅ | **MATCH** |
| i-912.pdf         | 07/22/25      | Form I-912 Edition 07/22/25  | —               | ✅ | **MATCH** |
| i-912instr.pdf    | 07/22/25      | Form I-912 Instructions 07/22/25 | —             | ✅ | **MATCH** |

**Zero mismatches. Zero blockers.**

## First-page metadata (path F)

| File              | OMB No.    | Expires      | Form ID on page |
|-------------------|-----------|--------------|------------------|
| i-821.pdf         | 1615-0043 | 02/28/2027   | I-821            |
| i-765.pdf         | 1615-0040 | 08/31/2027   | I-765            |
| i-765ws.pdf       | 1615-0040 | 08/31/2027   | I-765 (Worksheet) |
| i-912.pdf         | 1615-0116 | 03/31/2027   | I-912            |

OMB numbers checked against USCIS public OMB register convention — all are valid USCIS form OMB IDs and consistent across form + instructions of the same family.

## Page-count cross-check (path E)

| File           | pypdf | pdfinfo | Match |
|----------------|-------|---------|-------|
| i-821.pdf      | 13    | 13      | ✅    |
| i-821instr.pdf | 15    | 15      | ✅    |
| i-765.pdf      | 7     | 7       | ✅    |
| i-765instr.pdf | 25    | 25      | ✅    |
| i-765ws.pdf    | 1     | 1       | ✅    |
| i-912.pdf      | 8     | 8       | ✅    |
| i-912instr.pdf | 12    | 12      | ✅    |

## Form architecture (path G) — CRITICAL FOR AUTO-FILL

All four fillable forms (I-821, I-765, I-765WS, I-912) use **Hybrid XFA + AcroForm**. This is the standard USCIS dynamic-form architecture.

| File          | Architecture | pypdf field count | AcroForm root | Implication |
|---------------|--------------|-------------------|---------------|-------------|
| i-821.pdf     | Hybrid (XFA + AcroForm) | 511 | 1 root → 511 inferred | pdf-lib can write to AcroForm shadow tree |
| i-765.pdf     | Hybrid | 180 | 1 root → 180 inferred | same |
| i-765ws.pdf   | Hybrid | 13  | 1 root → 13 inferred | same |
| i-912.pdf     | Hybrid | 241 | 1 root → 241 inferred | same |
| i-821instr.pdf | AcroForm (informational only) | 10  | 0 fillable | n/a |
| i-765instr.pdf | None | 0 | 0 | n/a |
| i-912instr.pdf | None | 0 | 0 | n/a |

### What this means for auto-fill (real risk, flagged ahead of cycle)

USCIS forms are dynamic XFA. Adobe Reader prefers the XFA model; pdf-lib writes to the AcroForm shadow. Three known mitigations exist:

1. **Flatten on output** — convert filled values to static page content. pdf-lib supports this. Loses Adobe's "validate on open" behavior but the printed/uploaded PDF is correct.
2. **Strip XFA stream** — remove `/AcroForm/XFA` after fill, leaving only AcroForm. Adobe falls back to AcroForm rendering.
3. **Use a non-pdf-lib library** — pdfcpu (Go) or qpdf (CLI) handle XFA more cleanly. Heavier dependency.

This is the same technical problem the immigration tech industry has solved for years. It will be addressed in the prefiller implementation cycle with a fixture test (fill one I-821, open in Adobe and Preview, screenshot the result).

**Not a blocker for the source layer cycle. Documented so we don't trip on it later.**

## Where the other helper was wrong

The previous helper claimed:
- I-765 edition `01/20/25` — **WRONG.** Current edition per uscis.gov + PDF footer + Chrome visual is `08/21/25`.
- I-765 Worksheet edition `01/20/25` — **WRONG.** Current is `08/21/25`.

It correctly noted I-821 `01/20/25` and I-912 `07/22/25`. The likely explanation: it confused the I-821 edition with the I-765 edition (both start with `0`) or pulled from a cached search result. This is exactly the failure mode the original task spec warned about (`High: скачать старую форму из кеша`).

If we had trusted that helper, we would have built the I-765 prefiller against a stale field map. Any field renamed between editions would silently misfile data into the wrong slot. The audit chain caught it.

## Output artefacts

```
docs/uscis/forms/tps/
  pdf/                              7 official PDFs, SHA256-verified
  html/                             4 raw USCIS HTML pages (traceability)
  forms_manifest.json               machine-readable inventory + SHA256 + edition_match
  _audit_report.json                this audit in raw JSON
  field_inventory_i821.json/.md     511 fields
  field_inventory_i765.json/.md     180 fields
  field_inventory_i765ws.json/.md   13 fields
  field_inventory_i912.json/.md     241 fields
  tps_field_mapping_v1.md           mapping plan, ready for next cycle
  AUDIT_REPORT.md                   ← you are here

scripts/uscis/
  refresh_tps_forms.sh              one-command rerun
  build_manifest.py
  inventory_fields.py
```

## CI gate proposal

Add to `apps/web/scripts/check-content-guards.sh` (or a sibling guard):

```bash
# Fail the build if any TPS form is not 'current_from_official_page'.
python3 -c "
import json, sys
m = json.load(open('docs/uscis/forms/tps/forms_manifest.json'))
bad = [k for k, v in m['forms'].items() if v['edition_match'] != 'current_from_official_page']
if bad:
    print('TPS FORMS DRIFT:', bad)
    sys.exit(1)
"
```

This forces operator to re-run `scripts/uscis/refresh_tps_forms.sh` and regenerate manifest before any TPS-related deploy proceeds. No stale form can ship.

## Next step

Cycle `TPS_AUTOFILL_CYCLE_1`:
- Pin exact field names per row in `tps_field_mapping_v1.md` from the inventory JSONs.
- Build minimal `pdfPrefiller(form, fieldMap, data)` engine using pdf-lib.
- Fixture: one initial-path adult applicant (passport only, no EAD, no fee waiver) → produce I-821 + I-765.
- Open the output PDFs in Adobe Acrobat and Preview, screenshot, confirm fields rendered correctly.
- Then and only then address XFA flatten/strip strategy.

Duration: 2-3 working days. Pre-conditions: this source layer merged.
