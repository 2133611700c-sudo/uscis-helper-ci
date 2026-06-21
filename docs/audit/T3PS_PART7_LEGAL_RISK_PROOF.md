# T3PS Part 7 Legal-Risk Proof

- Date: 2026-05-14
- Environment: Production (`messenginfo.com`)
- Route: `/ru/services/tps-ukraine/start` (Step 6)

## Cases

### 1) all_part7_no
- Observed: no legal-risk warning card shown.
- Evidence:
  - `docs/reports/evidence/t3ps-closeout/browser/14-part7-all-no-visible.png`

### 2) criminal_yes (representative yes-case)
- Action: switched first legal-risk toggle to `Да`.
- Observed: warning card appears before generation area:
  - heading `Стоит поговорить с юристом`
  - text states situation may be complex
  - explicit non-law-firm statement
  - USCIS legal services link present
- Evidence:
  - `docs/reports/evidence/t3ps-closeout/browser/15-part7-yes-legal-warning.png`

### 3) removal_yes
### 4) prior_denial_yes
- Not executed as separate toggles in this pass.
- Coverage status: `PARTIAL` for per-toggle repetition, but legal-risk mechanism is verified by yes-case trigger.

## Generate gate behavior

- With attestation checked, generation still blocked when Part 7 declaration is not confirmed.
- On-screen message: `Необходимо подтвердить проверку Part 7 перед генерацией.`
- Evidence:
  - `docs/reports/evidence/t3ps-closeout/browser/16-attestation-checked-generate-disabled-part7-not-confirmed.png`

## Compliance wording checks

- `Messenginfo — не юридическая фирма и не оказывает юридические консультации.` is present in warning context.
- No legal-advice promise was observed in this warning block.

## Result

- Part 7 yes-case legal-risk warning: `VERIFIED`.
- Full per-question matrix (criminal/removal/prior_denial as separate runs): `PARTIAL`.
