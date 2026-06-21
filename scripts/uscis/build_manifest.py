import os, re, json, hashlib, subprocess, datetime
from pypdf import PdfReader

TPS = "/Users/sergiiivanenko/work/uscis-helper/docs/uscis/forms/tps"
PDF_DIR = os.path.join(TPS, "pdf")
DOWNLOADED_AT = "2026-05-10T22:41:48Z"   # from the curl run

# Pulled from the USCIS form pages (parsed earlier).
META = {
    "i821":       {"form_id":"I-821",       "form_title":"Application for Temporary Protected Status",                          "kind":"form",         "file":"i-821.pdf",       "page_edition":"01/20/25", "page_last_reviewed":"03/30/2026", "official_page":"https://www.uscis.gov/i-821"},
    "i821_instr": {"form_id":"I-821",       "form_title":"Instructions for Form I-821",                                          "kind":"instructions", "file":"i-821instr.pdf",  "page_edition":"01/20/25", "page_last_reviewed":"03/30/2026", "official_page":"https://www.uscis.gov/i-821"},
    "i765":       {"form_id":"I-765",       "form_title":"Application for Employment Authorization",                             "kind":"form",         "file":"i-765.pdf",       "page_edition":"08/21/25", "page_last_reviewed":"04/30/2026", "official_page":"https://www.uscis.gov/i-765"},
    "i765_instr": {"form_id":"I-765",       "form_title":"Instructions for Form I-765",                                          "kind":"instructions", "file":"i-765instr.pdf",  "page_edition":"08/21/25", "page_last_reviewed":"04/30/2026", "official_page":"https://www.uscis.gov/i-765"},
    "i765_ws":    {"form_id":"I-765WS",     "form_title":"Form I-765 Worksheet",                                                 "kind":"worksheet",    "file":"i-765ws.pdf",     "page_edition":"08/21/25", "page_last_reviewed":"04/30/2026", "official_page":"https://www.uscis.gov/i-765"},
    "i912":       {"form_id":"I-912",       "form_title":"Request for Fee Waiver",                                               "kind":"form",         "file":"i-912.pdf",       "page_edition":"07/22/25", "page_last_reviewed":"12/16/2025", "official_page":"https://www.uscis.gov/i-912"},
    "i912_instr": {"form_id":"I-912",       "form_title":"Instructions for Form I-912",                                          "kind":"instructions", "file":"i-912instr.pdf",  "page_edition":"07/22/25", "page_last_reviewed":"12/16/2025", "official_page":"https://www.uscis.gov/i-912"},
}

def detect_pdf_edition(path, file_basename):
    """Use pdftotext to detect edition stamp on every page; return first match."""
    try:
        txt = subprocess.check_output(["pdftotext", "-layout", path, "-"], stderr=subprocess.DEVNULL).decode("utf-8", "replace")
    except Exception:
        return None
    # Footers: 'Form I-XXX Edition MM/DD/YY' for forms; 'Form I-XXX Instructions MM/DD/YY' for instructions.
    for pat in [r'Form I-\d+[A-Z]*\s+(?:Edition|Instructions)\s+(\d{2}/\d{2}/\d{2})']:
        m = re.search(pat, txt)
        if m:
            return m.group(1)
    return None

results = {}
for key, meta in META.items():
    path = os.path.join(PDF_DIR, meta["file"])
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    reader = PdfReader(path)
    pages = len(reader.pages)
    pdf_edition = detect_pdf_edition(path, meta["file"])
    raw_fields = reader.get_fields() or {}
    status = "current_from_official_page" if pdf_edition == meta["page_edition"] else ("blocked" if pdf_edition is None else "mismatch")
    results[key] = {
        **meta,
        "pdf_url": "https://www.uscis.gov/sites/default/files/document/forms/" + meta["file"],
        "instructions_url": (
            "https://www.uscis.gov/sites/default/files/document/forms/" + (
              "i-821instr.pdf" if meta["form_id"] in ("I-821",) else
              "i-765instr.pdf" if meta["form_id"] in ("I-765","I-765WS") else
              "i-912instr.pdf"
            )
        ),
        "edition_from_uscis_page": meta["page_edition"],
        "edition_detected_in_pdf": pdf_edition,
        "edition_match": status,
        "page_count": pages,
        "bytes": os.path.getsize(path),
        "sha256": sha,
        "form_field_count": len(raw_fields),
        "downloaded_at_utc": DOWNLOADED_AT,
        "local_path": os.path.relpath(path, "/Users/sergiiivanenko/work/uscis-helper"),
    }
    print(f"{key}: pages={pages} fields={len(raw_fields)} pdf_edition={pdf_edition} page_edition={meta['page_edition']} -> {status}")

with open(os.path.join(TPS, "forms_manifest.json"), "w") as f:
    json.dump({
        "schema_version": 1,
        "captured_at_utc": DOWNLOADED_AT,
        "source_policy": "Only PDFs linked from official USCIS form pages. Cached or third-party copies are forbidden.",
        "forms": results
    }, f, indent=2)
print("\nWrote", os.path.join(TPS, "forms_manifest.json"))
