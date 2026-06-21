# T3PS Stage I Release Lock

Date: 2026-05-16  
Service: https://messenginfo.com/ru/services/tps-ukraine/start

## Lock Conditions
- Functional status is locked to **controlled beta only**.
- `paid_launch_ready` remains **false**.
- Server-side validation for critical fields (including `passport_number`, `passport_expiration_date`, `marital_status`, `part7_reviewed`) must not be weakened.
- No real PII may be committed to repo artifacts.

## Verified on Lock
- SHA truth reconciled (`local == origin == production`) at lock time.
- Gates pass: typecheck/test/lint/guard:content/build.
- Browser flow A/B pass with `generate-packet=200` and ZIP download.
- PDF redacted dumps show required key fields and `cyrillic_leak=NONE`.

## Operational Guardrails
- Telegram monitoring transport is tracked as operational risk, not a functional blocker.
- `_vercel/insights`/CSP console noise is tracked as P1 non-blocking.
- USCIS notice OCR is explicitly out of Stage I scope.

## Change Freeze for Stage I
- No new features, no redesign, no payment flow work, no I-912 implementation under this lock.
- Only bugfixes for verified P0 functional regressions are allowed.
