# GT — Owner Fill Pack: next 4 files (to reach ready ≥6)

**Date:** 2026-06-04. Agent prepared private skeletons; **owner fills the values** (human truth, never
model output). ready_before = 2 → target ≥6 → fill at least 4 of these. value = AS WRITTEN on the document.

> Field names below are the REAL template/adapter field ids (not invented). The skeletons already exist,
> pre-structured, value-free, `_meta.ground_truth_status="OWNER_INPUT_REQUIRED"`. You only type values
> and flip status to `VERIFIED_BY_OWNER`. Filled files stay in `qa-private/` (gitignored) — do NOT commit.

## Files to open (already created for you)

| # | private file (qa-private/ground-truth/) | owner_verified_fields (must fill all) |
|---|---|---|
| 1 | `international_passport_owner_fill.json` | family_name_cyrillic, given_name_cyrillic, date_of_birth, passport_number, sex |
| 2 | `id_card_owner_fill.json` | family_name_cyrillic, given_name_cyrillic, middle_name_cyrillic, date_of_birth, doc_number, sex |
| 3 | `i94_owner_fill.json` | family_name, given_name, date_of_birth, i94_admission_number, i94_class_of_admission, i94_date_of_entry |
| 4 | `ead_owner_fill.json` | family_name, given_name, date_of_birth, a_number, card_number, ead_category |

## Where to look on the document

- **Passport (international):** name page — surname/given (Cyrillic + MRZ Latin), passport number, DOB, sex.
  MRZ is the strong anchor; type the Cyrillic as printed.
- **ID card:** front — surname/given/patronymic (Cyrillic), document number, DOB, sex.
- **I-94:** the admission record — 11-digit admission number, name (Latin), DOB, date of entry, class of admission.
- **EAD card:** name (Latin), A-number (USCIS#/A###), card number, category code (e.g. C08), DOB.

## Rules

- `value` = exactly as written on the document (Russian doc → Russian form; UA → UA form).
- `normalized_value` (`*_latin`/`*_english`) = canonical, SEPARATE — fill only if you want; not required.
- Unreadable field → `null` + a line in `notes`. A `null` is valid GT (excluded from accuracy), not a failure.
- `candidate_not_verified` fields (already `null` in the skeleton) — optional, never penalized.
- Dates `YYYY-MM-DD`; sex `M`/`F`.
- When done per file: set `"_meta": { ... "ground_truth_status": "VERIFIED_BY_OWNER" }`.

## How to fill (either way)

**Hand:** open the JSON + the document image, type values, set `VERIFIED_BY_OWNER`, save.
**Helper (validates format, sets VERIFIED for you):**
```bash
node scripts/gt_intake.mjs qa-private/ground-truth/international_passport_owner_fill.json <<'JSON'
{ "family_name_cyrillic":"…", "given_name_cyrillic":"…", "passport_number":"…",
  "date_of_birth":"YYYY-MM-DD", "sex":"M" }
JSON
```

## Readiness check (counts only, NO PII)

```bash
python3 - <<'PY'
import json,glob,os
ready=0; total=0
for f in sorted(glob.glob("qa-private/ground-truth/*.json")):
    total+=1; d=json.load(open(f)); m=d.get("_meta",{}) or {}
    ovf=m.get("owner_verified_fields") or []
    st=m.get("ground_truth_status") or d.get("ground_truth_status")
    filled=sum(1 for k in ovf if str(d.get(k,"")).strip())
    ok=(st=="VERIFIED_BY_OWNER" and ovf and filled==len(ovf))
    if ok: ready+=1
    print(f"{os.path.basename(f):45} {str(st)[:22]:22} {filled}/{len(ovf)} ready={'yes' if ok else 'no'}")
print(f"READY_SUMMARY {ready}/{total}")
PY
```

## After fill
Say **"GT batch filled"** → agent runs git-safety + readiness; if ready ≥6 → accuracy + threshold
calibration (sanitized report; raw in qa-private). L2-WIRE only after calibration, separate command.
