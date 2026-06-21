# Enforce-Mode Smoke Runbook — Canonical Continuity (PR #117)

Owner-driven runbook to validate `CANONICAL_CONTINUITY_MODE=enforce` on the
**preview** deploy before merging and flipping production.

- Branch: `architecture/canonical-continuity`
- Supabase project: `rtfxrlountkoegsseukx`
- Vercel preview dashboard:
  https://vercel.com/sergiis-projects-8a97ee0f/uscis-helper/DfuJ1rtMW4vjdsMnc3XbK6fvoiNk
- Smoke script: `scripts/smoke-enforce-preview.ts`

---

## What the automated smoke actually proves (and what it does not)

The script `scripts/smoke-enforce-preview.ts` is **read-only HTTP**. Every call it
makes returns its status code **before** any DB write, payment charge, PDF render,
or email send. It proves the enforce gate is **live** on the preview:

| Check | Endpoint | Input | Expected |
|-------|----------|-------|----------|
| T1 | `POST /api/translation/generate-pdf` | no `canonical_document_id` | `422 CANONICAL_ID_REQUIRED` |
| T2 | `POST /api/translation/generate-pdf` | bogus (non-existent) UUID | `404 CANONICAL_NOT_FOUND` |
| T3 | `POST /api/translation/render` | no `canonical_document_id` | `422 CANONICAL_ID_REQUIRED` |
| T4 | `POST /api/translation/render` | bogus (non-existent) UUID | `404 CANONICAL_NOT_FOUND` |

If the preview were still in `shadow` mode, T1/T3 would NOT return 422 — they would
fall through to the payment/review gates (402/403/400). A green run is therefore
positive evidence the preview env has `enforce` set **and** was redeployed.

**NOT covered by the read-only smoke (must be done manually / via integration test):**

1. **extract → real canonical UUID.** The OCR extract endpoint runs PAID Google
   Vision and INSERTs a `canonical_documents` row only on a real UA-identity read.
   A synthetic placeholder image yields no canonical id, so this is an owner-manual
   step (upload one real PII-free test doc) — see step D-extended below.
2. **override 200 then 409 version-conflict.** There is **no HTTP override route**
   on this branch (`apps/web/src/app/api/canonical/[id]/override/` does not exist).
   `appendCanonicalOverride()` is library-only. The atomic/version-conflict
   guarantee is verified by the **library integration test**
   `canonicalConcurrency.integration` (step H), not by an HTTP call. The smoke
   script does **not** invent an endpoint.
3. **generate-pdf 200 + 7-field cert metadata.** Reaching 200 requires an owner
   session (or paid Stripe session) + a real canonical id + a signed review
   payload. Validated via owner-manual run + Supabase SQL check (step F).

---

## Owner steps (in order)

### A. Confirm CI is green on PR #117
```
gh pr checks 117
```
Do not proceed until all required checks pass.

### B. Set enforce on the PREVIEW env (NOT production) and redeploy
In the Vercel preview environment for this branch:
- Set `CANONICAL_CONTINUITY_MODE=enforce`
- **Redeploy the preview** (Vercel applies env changes to the NEXT deploy only —
  setting the var without redeploying does nothing).

### C. Get the preview URL and export it
```
export PREVIEW_BASE_URL=https://uscis-helper-xxxx.vercel.app   # no trailing slash
```

### D. Run the smoke
```
pnpm tsx scripts/smoke-enforce-preview.ts
```

### E. Expected result
```
SUMMARY: 4/4 PASS
```
If T1/T3 did not 422: the preview is not in enforce mode, or was not redeployed
after the env change. Re-do step B.

### D-extended (owner-manual: real extract → 200 PDF path)
Only if you want full end-to-end coverage beyond the gate:
1. In the preview wizard, upload ONE real PII-free Ukrainian test document
   (e.g. a sample birth certificate) through the normal flow.
2. Confirm the extract response includes a `canonical_document_id` (UUID).
3. Complete the review + signature as owner (owner session bypasses Stripe).
4. Confirm the PDF downloads (200) and the email is sent.

### F. Verify in Supabase (project `rtfxrlountkoegsseukx`)
Smoke-created and test rows use a `SMOKE`/test sentinel in `session_id`.
```sql
-- canonical rows created by manual extract test (read-only smoke writes NONE)
SELECT count(*) FROM canonical_documents WHERE session_id LIKE 'SMOKE%';

-- override versions must be strictly monotonic per canonical_id (no gaps that
-- break ordering, no duplicates):
SELECT canonical_id, array_agg(version ORDER BY version) AS versions
FROM canonical_overrides
GROUP BY canonical_id
HAVING count(*) <> count(DISTINCT version);   -- expect 0 rows (no dup versions)

-- 7-field certification binding present after a 200 generate-pdf:
SELECT canonical_document_id, base_canonical_hash, resolved_canonical_hash,
       override_set_hash, override_version, canonical_schema_version, renderer_version
FROM translation_certification_audit
WHERE canonical_document_id IS NOT NULL
ORDER BY created_at DESC LIMIT 5;
-- All 7 columns must be NON-NULL for a canonical-sourced certification.
```

### G. Cleanup smoke rows
The read-only HTTP smoke writes nothing. Only the manual extract test (D-extended)
and the integration test create rows. Clean them:
```sql
-- overrides first (FK to canonical_documents, ON DELETE RESTRICT)
DELETE FROM canonical_overrides
 WHERE canonical_id IN (
   SELECT id FROM canonical_documents WHERE session_id LIKE 'SMOKE%'
 );
DELETE FROM canonical_documents WHERE session_id LIKE 'SMOKE%';
-- integration-test sentinel (created by canonicalConcurrency.integration):
DELETE FROM canonical_overrides
 WHERE canonical_id IN (
   SELECT id FROM canonical_documents WHERE session_id = 'CANONICAL_CONCURRENCY_TEST'
 );
DELETE FROM canonical_documents WHERE session_id = 'CANONICAL_CONCURRENCY_TEST';
```

### H. (Optional but recommended) Run the override concurrency integration test
This is the ONLY thing that exercises the atomic override / version-conflict RPC
(`append_canonical_overrides_atomic`) end-to-end, because no HTTP override route
exists. Add two GitHub repo secrets so CI runs it automatically:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Locally:
```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm --filter web run test -- canonicalConcurrency.integration
```
Expected: `concurrent_append_same_expected_version_one_succeeds` proves exactly one
of two version-0 appends succeeds and the other throws
`OVERRIDE_VERSION_CONFLICT`; `concurrent_append_no_duplicate_version` proves no
duplicate versions. The test cleans up its own rows in `afterAll`.

### I. Production cutover — only after owner GO
1. Owner GO on the green preview smoke (steps E + F + H).
2. Merge PR #117 → `main`.
3. Production deploys via Vercel on push.
4. In the **production** Vercel env, set `CANONICAL_CONTINUITY_MODE=enforce`.
5. **REDEPLOY production** (env applies to the NEXT deploy only).
6. Run the production smoke against the production domain:
   ```
   PREVIEW_BASE_URL=https://messenginfo.com pnpm tsx scripts/smoke-enforce-preview.ts
   ```
   (the variable name is `PREVIEW_BASE_URL` but any base URL works — point it at prod).
7. Confirm the deploy SHA:
   ```
   curl -s https://messenginfo.com/api/healthz
   ```
   Verify the returned commit SHA matches the merged `main` HEAD.

---

## Rollback (no data loss)

If enforce causes any user-facing 422/404 regression in production:
1. Set `CANONICAL_CONTINUITY_MODE=off` in the affected Vercel env
   (production or preview).
2. **Redeploy** (env applies to next deploy only).

Effect: routes fall back to `extracted_fields`; canonical persistence is skipped.
No data is deleted — `canonical_documents` and `canonical_overrides` are INSERT-only
(append-only) tables; toggling the mode only changes which source the routes read.
`shadow` is the intermediate state (canonical loaded when present, fail-open to
extracted fields) if you want to keep persisting without enforcing.
