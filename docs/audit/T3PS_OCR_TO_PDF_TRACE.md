# T3PS OCR → Wizard → PDF Trace

- Task: `T3PS-FINAL-FUNCTIONAL-CLOSEOUT`
- SHA: `0627cba5fe5a3b0a94ccf0b05e62476eed96dca0`

Field-chain status:
- `family_name`, `given_name`, `dob`, `passport_number`, `passport_expiration_date`: OCR key present → review visible → request body populated in Step 6 → I-821/I-765 mapping present → pypdf field present (`PASS`).
- `i94_admission_number`, `last_entry_date`, `a_number`: scenario B only, all stages `PASS`.
- `ead_category_on_card`: OCR/review/request stages `PASS`; PDF stage treated `PARTIAL` because it maps into split I-765 category cells (Item 27) instead of a single semantic key.
- `marital_status`, `part7_reviewed`: manual path only (not OCR), both enforce generate gate and are reflected in I-821 (`PASS`).

Evidence anchors:
- Step 6 request wiring: [GeneratePacketBlock.tsx](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx:790)
- Part7 request flag: [GeneratePacketBlock.tsx](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx:865)
- Step 6 selectors for manual fallback:
  - [GeneratePacketBlock.tsx](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx:1028)
  - [GeneratePacketBlock.tsx](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx:1032)
- I-821 map: [i821FieldMap.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/tps/forms/i821FieldMap.ts:92)
- I-765 map: [i765FieldMap.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/tps/forms/i765FieldMap.ts:41)
- OCR module merge/fallback + module count headers: [route.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/api/tps/ocr/extract/route.ts:300)
- Browser run status: [browser_summary.json](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_A/browser_summary.json:1), [browser_summary.json](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_B/browser_summary.json:1)
- pypdf proof: [T3PS_PDF_ZIP_FINAL_PROOF.yaml](/Users/sergiiivanenko/work/uscis-helper/docs/audit/T3PS_PDF_ZIP_FINAL_PROOF.yaml:1)

Verdict: `PASS`
