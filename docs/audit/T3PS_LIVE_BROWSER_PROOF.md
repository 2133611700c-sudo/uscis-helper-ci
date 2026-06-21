# T3PS Live Browser Proof (Production)

- Date: 2026-05-14
- Mode: Computer Use + Chrome
- Target: [https://messenginfo.com/ru/services/tps-ukraine/start](https://messenginfo.com/ru/services/tps-ukraine/start)
- Commit SHA under verification: `146c5581c4ca17564c6307663a1d373ff8cb67d7`

## Verified checkpoints

1. Flow reachable in production and stepper works from Step 1 to Step 6.
2. Part 7 questionnaire visible in Step 6.
3. Legal-risk behavior appears when a Part 7 answer is `Yes`.
4. Attestation gate is present.
5. Generate button remains blocked when Part 7 declaration is not confirmed.

## Evidence files

- Step progression screenshots:
  - `docs/reports/evidence/t3ps-closeout/browser/05-tps-start-opened.png`
  - `docs/reports/evidence/t3ps-closeout/browser/07-step1-initial.png`
  - `docs/reports/evidence/t3ps-closeout/browser/08-step2-docs-date.png`
  - `docs/reports/evidence/t3ps-closeout/browser/09-step3-ead-fee.png`
  - `docs/reports/evidence/t3ps-closeout/browser/10-step4-evidence-list.png`
  - `docs/reports/evidence/t3ps-closeout/browser/11-step5-summary.png`
  - `docs/reports/evidence/t3ps-closeout/browser/12-step6-form-top.png`
- Part 7 and legal-risk:
  - `docs/reports/evidence/t3ps-closeout/browser/14-part7-all-no-visible.png`
  - `docs/reports/evidence/t3ps-closeout/browser/15-part7-yes-legal-warning.png`
- Attestation/Generate gate:
  - `docs/reports/evidence/t3ps-closeout/browser/16-attestation-checked-generate-disabled-part7-not-confirmed.png`
- Session notes:
  - `docs/reports/evidence/t3ps-closeout/browser/computer_use_session_notes.yaml`

## Console/network evidence

- Browser console/network export from Chrome DevTools was not captured in this pass.
- Status: `PARTIAL` for the console/network subsection only.

## Result

- Browser contour: `VERIFIED` for navigation + Part 7 legal warning + attestation/generate gate behavior.
- Console/network log capture: `PARTIAL` (missing explicit exported traces).
