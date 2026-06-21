# T3PS Controlled Beta Day1 Report

- Task: `T3PS-09-CONTROLLED-BETA-OPERATIONS-AND-FIRST-USERS`
- Timestamp (UTC): `2026-05-16T00:11:00Z`
- Production SHA: `132f0f582cf5807b931daf3657ce274b128d3342`

## Operations status
- Health: `ok=true`, SHA matches baseline.
- Monitoring transport: `BLOCKED_WITH_EXACT_MISSING_ENV`.
- Verified present key: `CRON_SECRET` (production).
- Missing env keys: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Support flow
- Manual-help CTA exists in TPS UI.
- Non-PII ticket creation test: `PASS`.
  - Response: `{"ok":true,"ticket_id":"9b7fb5ae-55be-4b60-a179-f5c2cb5eec92","status":"queued"}`
  - Latest production response: `{"ok":true,"ticket_id":"ce0ae435-0fb1-4662-8199-67f04b5d66b8","status":"queued","reused":false}`
- Route stores only reason/email/locale/stage by contract; no image/raw OCR fields accepted in model.

## Dry run
- Status: `PASS`
- Evidence: `/Users/sergiiivanenko/work/uscis-helper/docs/reports/evidence/t3ps-final-release/browser-run-clean/browser_summary.json`
- OCR: `200`
- Generate: `200`
- ZIP intercept bytes: `1825484`
- Failed requests: `2` (non-blocking analytics script 404 noise).

## Testers
- Prepared testers list and invitation template: `3` trusted tester IDs.
- Evidence: `/Users/sergiiivanenko/work/uscis-helper/docs/audit/T3PS_CONTROLLED_BETA_USERS.md`

## Issues
- P0: monitoring transport env blocker.
- P1: manual-review endpoint strict schema fix deployed and verified (extra key returns 400).
- Source: `/Users/sergiiivanenko/work/uscis-helper/docs/audit/T3PS_BETA_ISSUES.yaml`

## Day1 status
- `BETA_BLOCKED_MONITORING`
- Continue beta invites only after monitoring transport keys are configured and test alert is delivered.
