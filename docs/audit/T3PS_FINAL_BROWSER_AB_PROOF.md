# T3PS Final Browser A/B Proof (Current Cycle)

Generated: 2026-05-24T05:58:00Z

## Client Mode
- Source: `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual_proof_summary.json`
- Result: **PASS**
  - selector contract present (`tps-ocr-cta`, upload slot/input prefixes),
  - OCR per slot: `passport/booklet/i94/i797_or_ead/dl => 200`,
  - unpaid step shows paywall (`paywall_visible=true`),
  - paid callback path clicks generate (`generate_clicked_paid=true`),
  - `generate_statuses=[200]`,
  - ZIP downloaded in same run (`zip.downloaded=true`).

## Owner Mode
- Result: **BLOCKED**
  - `owner_session=false`
  - blocking reason: no owner session available in automation context.

## Screenshots
- `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual-proof-shots/client_step6_unpaid.png`
- `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual-proof-shots/client_step6_paid_callback.png`
- `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual-proof-shots/client_after_generate.png`

## Network Evidence
- `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual_proof_network.json`
- `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/dual_proof_failed_requests.json`

Verdict: **PARTIAL** (client contour closed; owner contour blocked by access context).
