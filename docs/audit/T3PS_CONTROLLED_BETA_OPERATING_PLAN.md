# T3PS Controlled Beta Operating Plan

## Beta Guardrails
- Audience: 3-5 trusted users only.
- No paid traffic, no ad campaigns, no public launch messaging.
- `paid_launch_ready` remains `false`.

## Operator Rules
- If OCR fails: user either retries upload or completes manual entry.
- If legal-risk flag is `yes`: show warning; no legal advice.
- If user does not know a critical field: do not guess, do not bypass validation.
- Never store or commit raw user documents or unredacted screenshots.

## Monitoring (counts only, no PII)
- Health check: `/api/tps/health` every 5-15 minutes.
- Alert on repeated 5xx:
  - `/api/tps/ocr/extract`
  - `/api/tps/generate-packet`
- Daily summary counters:
  - TPS starts
  - OCR attempts/success/fail
  - Generate success/fail
  - Manual-help requests

## Rollback
- Last known good commit: `94ac67ec8a3f881acae3b3fbe1238ccdc8626d28`
- Current controlled-beta lock commit: `TBD_AFTER_COMMIT`
- Vercel rollback command:
  - `vercel rollback <deployment-id> --scope 2133611700c-sudo`
- Emergency response:
  - show maintenance banner or temporarily disable TPS route if repeated critical failure.

## Support Intake Template
- Device / OS
- Browser + version
- Document type uploaded
- Exact step where user got stuck
- ZIP downloaded: yes/no
- PDF looked correct: yes/no
- Any validation error text shown

## Evidence Policy
- Redact all screenshots before sharing.
- Do not include names, passport numbers, DOB, addresses in reports.
- Keep evidence as keys/counts/status only.
