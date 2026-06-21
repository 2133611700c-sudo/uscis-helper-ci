# CERTIFIED DOCUMENT INCIDENT RUNBOOK

Date: 2026-06-10
Scope: production incidents touching a CERTIFIED translation PDF — the legal output.
Status: v1 (interim). Owner to confirm refund/escalation thresholds.

## When to use this

A user reports (or monitoring shows) one of:
- a certified PDF was generated with a wrong/garbage/Cyrillic value in a critical field,
- a paid user cannot get their PDF (blocked post-charge),
- the confirmed-value guard is over-blocking legitimate users at high rate,
- the wrong Gemini model served prod reads (fallback flood),
- any suspicion the output door released a defect.

## Severity

- **SEV-1** — a defective certified PDF reached a user (wrong identity/number/date in critical field). Legal exposure.
- **SEV-2** — paid users blocked from valid output (revenue + trust). Or guard over-blocking > a few %.
- **SEV-3** — degraded quality with no defective output released (e.g. fallback-model flood, all review-gated).

## Immediate handles (no deploy needed)

1. **Over-blocking emergency:** set `EMERGENCY_GUARD_BYPASS=1` in Vercel prod env + redeploy.
   - Reverts release-value sanitation to prior reviewGate-only behavior.
   - LOUDLY logged (`[confirmed_value_guard] EMERGENCY_GUARD_BYPASS=1 … degraded safety`).
   - This is degraded-safety mode — open a SEV and fix the guard, do not leave it on.
   - NOTE: on Vercel an env change still requires a redeploy to take effect — it is
     a *simpler/safer revert* than a code rollback, not an instant toggle.
2. **Wrong model in prod:** verify `GEMINI_MODEL` is clean `gemini-3.1-pro-preview`
   (no trailing `\n`); see PROD_GEMINI_MODEL_FLIP_SMOKE report. Fallback-model reads
   of non-Latin docs are auto-review-gated (ADR-018) — a fallback flood degrades
   quality but does not release silent defects.
3. **Machine-read safety:** `OCR_FIELD_SAFETY_ENABLED` is the canary handle (default OFF).

## Triage steps

1. Reproduce with a SYNTHETIC, non-PII input if possible. Never paste a real user's PII into logs/tickets.
2. Pull the PII-free structured logs: `[confirmed_value_guard] block` (field/criticality/reason/doc_type), `[ADR018] fallback_model_used` (doc/model/counts).
3. Identify class: false-positive (over-block) vs false-negative (defect released) vs availability.
4. False-negative (defect released) = SEV-1 → escalate to owner immediately, preserve evidence, prepare client correction.

## Paid-user-blocked (interim policy until PAYMENT_REFUND_LEGACY_GATE_CONTRACT is finalized)

A user charged on Stripe checkout who then hits a 4xx block at generate-pdf:
- auto-alert support (Slack/email) with session id + reason code (NO PII),
- offer correction/retry first (same Stripe session is reusable),
- if unrecoverable: **pre-approved refund up to $X without escalation** (owner to set $X) —
  a refund beats a chargeback dispute. Log the refund + reason in the audit record.

## Post-incident

- File a short report under `docs/reports/` (no PII).
- If a guard rule caused a false positive: add a regression test, then remove the bypass.
- Update CRITICAL_FIELDS_CONTRACT / C3_USER_CORRECTION_CONTRACT if the contract was wrong.

## [OWNER DECISION] to finalize this runbook
- $X pre-approved refund ceiling.
- Support alert channel + on-call expectation.
- Whether SEV-1 (defect released) triggers proactive USCIS-filing correction outreach.
