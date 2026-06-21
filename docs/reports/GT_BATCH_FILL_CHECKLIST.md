# GT Batch — Owner Fill Checklist

**Date:** 2026-06-04. Owner-facing, docs-only. Goal: fill 6–10 verified GT docs so OneBrain
thresholds can be calibrated (L3 plan). Truth is human-read; never copy model/OCR output.
Filled files stay in `qa-private/ground-truth/` (gitignored). `value` = AS WRITTEN on the document
(GT_LANGUAGE_INTENT.md).

## 1. Documents to collect (target 6–10; different people if possible)

| # | category | template to copy (docs/templates/ground-truth/) | ready? |
|---|---|---|---|
| 1 | Soviet / Russian-language birth cert | `birth_cert_soviet.template.json` | ✅ template exists |
| 2 | Ukrainian PRINTED birth cert | `birth_cert_ua_printed.template.json` | ✅ |
| 3 | Ukrainian HANDWRITTEN birth cert | `birth_cert_handwritten.template.json` | ✅ |
| 4 | International passport | `international_passport.template.json` | ✅ |
| 5 | ID card | `id_card.template.json` | ✅ |
| 6 | Military ID | `military_id_p1.template.json` | ✅ |
| 7 | I-94 | — | ⏳ template TBD (US-form adapter fields — not invented) |
| 8 | EAD | — | ⏳ template TBD (US-form adapter fields — not invented) |

For I-94/EAD: tell the agent when you have one — it builds the template from the eadAdapter/Re-Parole
field set (no field invention) before you fill.

## 2. Fields YOU must verify (penalized in accuracy) — per `_meta.owner_verified_fields`

- **Birth cert (any):** child family / given / patronymic (as written), date_of_birth (`YYYY-MM-DD`),
  place_of_birth_raw (with с./смт/м. prefix), sex (`M`/`F`).
- **Passport:** family / given (as written), passport_number, date_of_birth, sex. (MRZ is the strong anchor.)
- **ID card:** family / given / middle name, date_of_birth, doc_number, sex.

## 3. Fields you can leave as `candidate_not_verified` (NOT penalized)

issuing_authority, act_record_number, issue_date, expiry_date, father/mother names, and any field the
template lists under `candidate_not_verified`. Fill them if easy, but they don't count against accuracy.

## 4. How to fill (two ways)

**A — by hand:**
```bash
cp docs/templates/ground-truth/birth_cert_ua_printed.template.json \
   qa-private/ground-truth/birth_cert_ua_printed_<surname>.json
# open it + the image, type values AS WRITTEN, set:
#   "_meta": { ... "ground_truth_status": "VERIFIED_BY_OWNER" }
```
**B — via the intake helper** (validates format, sets VERIFIED_BY_OWNER for you):
```bash
node scripts/gt_intake.mjs qa-private/ground-truth/birth_cert_ua_printed_<surname>.json <<'JSON'
{ "child_family_name_cyrillic":"…", "child_given_name_cyrillic":"…",
  "child_patronymic_cyrillic":"…", "date_of_birth":"YYYY-MM-DD",
  "place_of_birth_raw":"…", "sex":"M" }
JSON
```
Rules: dates `YYYY-MM-DD`; sex `M`/`F`; unreadable → `null` + a line in `notes`; `value` = exactly as
on the document (RU stays RU). Do NOT commit filled files (qa-private is gitignored).

## 5. Readiness check (counts only, NO PII printed)

```bash
python3 - <<'PY'
import json, glob
for f in sorted(glob.glob("qa-private/ground-truth/*.json")):
    d=json.load(open(f)); m=d.get("_meta",{}) or {}
    st=m.get("ground_truth_status") or d.get("ground_truth_status")
    ovf=m.get("owner_verified_fields") or []
    filled=sum(1 for k in ovf if str(d.get(k,"")).strip())
    print(f"{f.split('/')[-1]:42} status={st:16} verified_fields_filled={filled}/{len(ovf)}")
PY
```
Batch is ready when ≥6 files show `status=VERIFIED_BY_OWNER` with most `owner_verified_fields` filled.

## 6. After fill
Tell the agent **"GT batch filled"** → it reruns the accuracy matrix on the batch, scoring `value`
as-written vs the read raw layer, then calibrates `ACCEPT_THRESHOLD` so `false_negative_review = 0`
while minimizing `false_positive_review`. Only then: L2-WIRE (shadow-first, flag OFF, prod byte-identical).

> Restrictions: this checklist changes no runtime, no flags, no model, no prod env. L2-WIRE stays HOLD
> until the batch is filled and thresholds are calibrated.
