# T3PS PDF Field Proof (Production)

- Date: 2026-05-14
- Endpoint: [https://messenginfo.com/api/tps/generate-packet](https://messenginfo.com/api/tps/generate-packet)
- Verified SHA: `146c5581c4ca17564c6307663a1d373ff8cb67d7` (from `/api/tps/health`)

## Scenario A: `i821_only` (`wants_ead=false`)

- Request status: HTTP 200
- ZIP content:
  - present: `I-821.pdf`, `README.txt`
  - absent: `I-765.pdf`
- Evidence:
  - `test-fixtures/proof/t3ps-closeout/i821_only/http_code.txt`
  - `test-fixtures/proof/t3ps-closeout/i821_only/unpacked_files.txt`

## Scenario B: `i821_i765` (`wants_ead=true`)

- Request status: HTTP 200
- ZIP content:
  - present: `I-821.pdf`, `I-765.pdf`, `README.txt`
- Headers show runtime prefill counters:
  - `x-tps-i821-applied: 121`
  - `x-tps-i821-skipped: 2`
  - `x-tps-i765-applied: 36`
  - `x-tps-i765-skipped: 0`
- Evidence:
  - `test-fixtures/proof/t3ps-closeout/i821_i765/http_code.txt`
  - `test-fixtures/proof/t3ps-closeout/i821_i765/headers.txt`
  - `test-fixtures/proof/t3ps-closeout/i821_i765/unpacked_files.txt`

## Field dump + visual proof artifacts

- Full dumps:
  - `test-fixtures/proof/i821-field-dump.txt`
  - `test-fixtures/proof/i765-field-dump.txt`
- Visual renders:
  - `test-fixtures/proof/i821-page1.png`
  - `test-fixtures/proof/i821-part7-pages.png`
  - `test-fixtures/proof/i765-page1.png`
- Quick heads (closeout folder):
  - `docs/reports/evidence/t3ps-closeout/pdf/i821-field-dump-head.txt`
  - `docs/reports/evidence/t3ps-closeout/pdf/i765-field-dump-head.txt`

## Result

- Scenario split by `wants_ead` is `VERIFIED`.
- I-821/I-765 production packet generation is `VERIFIED`.
- Part 7-related mapped field write-path remains with known `i821` skip pair (`Part7_Item4c_YN[0/1]`) already locked by tests.
