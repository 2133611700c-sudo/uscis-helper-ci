# T3PS Live Browser Functional Proof

- URL: [TPS start](https://messenginfo.com/ru/services/tps-ukraine/start)
- Viewport: `390x844`
- SHA: `0627cba5fe5a3b0a94ccf0b05e62476eed96dca0`

## Scenario A — I-821 only
- Summary: [browser_summary.json](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_A/browser_summary.json:1)
- Result:
  - `POST /api/tps/ocr/extract = 200`
  - `POST /api/tps/generate-packet = 200`
  - ZIP downloaded (`zip_size_bytes > 0`)
  - ZIP content: `I-821.pdf`, `README.txt`

## Scenario B — TPS + EAD + I-94
- Summary: [browser_summary.json](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_B/browser_summary.json:1)
- Result:
  - `POST /api/tps/ocr/extract = 200`
  - `POST /api/tps/generate-packet = 200`
  - ZIP downloaded (`zip_size_bytes > 0`)
  - ZIP content: `I-821.pdf`, `I-765.pdf`, `README.txt`

## Screenshots
- Scenario A: [screenshots](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_A/screenshots)
- Scenario B: [screenshots](/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-functional-closeout/scenario_B/screenshots)

## Network/console
- Known non-blocking noise in both runs:
  - `/_vercel/insights/script.js` 404
  - CSP blocking Cloudflare beacon script
- No blocking failures for OCR/generate APIs in either scenario.

Verdict: `PASS`
