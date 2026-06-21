# Translation Certification Audit — DB Persistence Fix
**Date:** 2026-05-30 · Severity: HIGH · status: **PASS (live insert/readback verified)**

## Root cause (confirmed against the real schema)
`/api/translation/generate-pdf` wrote the order with `supabase.from('translation_orders').upsert({...})` referencing columns that **do not exist**: `session_id`, `document_type`, `payment_confirmed`, `certification_record`, `scope_title`, `updated_at`. PostgREST rejects the whole write; supabase-js returns `{ error }` (it does NOT throw), so the `try/catch` swallowed nothing useful and the code never checked `.error`. Result: **the order and the attestation were never persisted** (live DB before fix: 2 rows, newest 2026-05-08, 0 `status='rendered'`).

Two more latent schema traps found by the live insert probe:
- `email` / `name` / `plan` are **NOT NULL** (the route now sends `email || ''`).
- `status` has a **CHECK** = `signed | emailed | failed` — the route wrote `'rendered'` (invalid); now writes `'signed'`.

## Fix
1. **Migration** `supabase/migrations/20260530000001_translation_certification_audit.sql` — new `translation_certification_audit` table (id, stripe_checkout_id, locale, document_type, certifier_name/address_present, signature_present/method, data_reviewed, accuracy_attested, review_confirmed, document_hash, certification_version, signed_at, created_at, audit_payload jsonb). RLS on; service-role only. **Applied to prod.**
2. **Route** `generate-pdf/route.ts`:
   - `translation_orders` insert remapped to the REAL columns (name/email/phone/address/plan/spanish_copy/locale/signed_at/signature_method/certification_version/status='signed'/stripe_checkout_id).
   - attestation inserted into `translation_certification_audit` (scalar columns + full `audit_payload` jsonb).
   - **DB errors are no longer swallowed** — `.error` is checked and logged (code + message, no PII). If the audit write fails, a `DEGRADED` warning is logged (no "audit complete" claim); the PDF is already produced.

## Verification (live, not just tests)
Inserted a probe row with the EXACT route shape into both tables and read it back:
```
order_rows = 1
audit_row  = { name_present:true, addr_present:true, signature_present:true,
               data_reviewed:true, accuracy_attested:true, hash:'abc123def456' }
```
Then deleted the probe (0 rows left). `attestation.test.ts` 5/5; full web suite pass; tsc 0; content-guard 0.

## Output contract
```
status:         PASS
migration_file: supabase/migrations/20260530000001_translation_certification_audit.sql (applied to prod)
schema_before:  translation_orders upsert → nonexistent columns → silent fail; 0 rendered rows
schema_after:   translation_orders insert → real columns; attestation → translation_certification_audit
db_write_result: live insert + readback OK (probe verified, then cleaned)
tests_run:      attestation 5/5 · full web pass · tsc 0 · content-guard 0
remaining_risk: end-to-end (real paid order) not yet exercised in prod — first real signed order will confirm; monitor the DEGRADED log line.
next_action:    deploy; then the CRITICAL live OCR/stale-state failure (separate report).
```
