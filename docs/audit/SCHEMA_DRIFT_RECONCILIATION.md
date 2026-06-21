# Schema-Drift Reconciliation (P1) — V2 Translation-Operator Migrations as Code-of-Record

Date: 2026-06-14 · Branch: `fix/p1-schema-drift-reconciliation` · Base: `main` @ `88e53ca`
Project: `rtfxrlountkoegsseukx` (prod, Postgres 17.6.1.111)

## Problem
5 V2 tables + 12 functions + 7 triggers + RLS/policies + 2 additive widenings (operator_override
source value; PHASE2_TEST_ canonical-guard cleanup) + a private storage bucket EXIST in production
but were created **only by frozen PR #119** (`origin/architecture/translation-operator-canonical-v2`).
No migration in `main` reproduces them → a clean DB built from `main` would NOT match prod.

## Action (this PR — migrations + docs ONLY, no runtime code)
Brought the 4 V2 migration SQL files into `main`'s `supabase/migrations/` under their original
filenames. The files are **byte-identical** to the PR #119 originals (verified with `diff`), because
each was already authored fully idempotent and ADDITIVE. No SQL was rewritten — verbatim adoption.

| file | creates | idempotency mechanism |
|------|---------|------------------------|
| `20260614000001_translation_orders_v2_and_state_machine.sql` | translation_orders_v2, translation_order_events, transition RPC + allowed-map, 2 guard fns + 3 triggers, RLS + policies | `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` + create, `DROP POLICY IF EXISTS` + create, idempotent `GRANT/REVOKE` |
| `20260614000002_translation_artifacts_outbox_and_security.sql` | document_artifacts, delivery_outbox, immutability guard + 2 triggers, create_artifact_and_enqueue, claim_outbox_event, phase2_admin_cleanup, storage bucket; widens canonical_overrides_source_check (+operator_override) | same + `DO $$ ... IF EXISTS (pg_constraint) THEN DROP ... ADD` guarded constraint swap; `INSERT ... ON CONFLICT (id) DO NOTHING` for bucket |
| `20260614000003_widen_canonical_guards_for_phase2_sentinel.sql` | re-defines 2 canonical guard fns to also honor PHASE2_TEST_ cleanup | **pure `CREATE OR REPLACE FUNCTION`** → inherently idempotent **no-op** on already-applied prod (bodies are identical to live) |
| `20260614000004_stripe_processed_events.sql` | stripe_processed_events, append-only guard + 2 triggers, record_stripe_processed_event, extends phase2_admin_cleanup | `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER/POLICY IF EXISTS` + create, `CREATE OR REPLACE FUNCTION`, `INSERT ... ON CONFLICT DO NOTHING` in the RPC |

Inline table constraints (PK/UNIQUE/CHECK) are scoped inside `CREATE TABLE IF NOT EXISTS`, so they
are created exactly once and never re-applied destructively on an existing prod table.

### Re-apply safety properties
- (a) **Clean DB from `main`** → these 4 files run in prefix order and reproduce the exact prod
  schema (FK chain: orders_v2 → artifacts/outbox/events/stripe; canonical_documents already exists
  from `20260613000000_*`).
- (b) **Existing prod DB** → every statement is a no-op on second apply: tables/indexes guarded by
  IF NOT EXISTS; functions `CREATE OR REPLACE` to identical bodies; triggers/policies dropped+recreated
  identically; the canonical_overrides_source_check swap re-adds the same 4-value superset; bucket
  insert `ON CONFLICT DO NOTHING`. **No destructive re-apply, no duplication, no re-break of canonical
  immutability** (file 000003 explicitly only `CREATE OR REPLACE`s — it never drops/alters the
  canonical tables, constraints, or triggers).

## Verification — DDL vs live prod fingerprint (diff = 0)
Each `CREATE`/`ALTER`/constraint/index/policy/trigger/function in the 4 migrations was compared
field-by-field against the live read-only introspection captured in
`SCHEMA_DRIFT_PROD_FINGERPRINT.md`:

- **Columns**: all 16+9+19+12+6 = 62 columns match name/type/nullability/default exactly. **0 diff.**
- **Constraints**: every PK, UNIQUE, FK, CHECK matches (incl. the widened `canonical_overrides_source_check`
  4-value superset). **0 diff.**
- **Indexes**: all named + partial indexes (incl. `uq_translation_orders_v2_checkout` and the
  `WHERE ... IS NOT NULL` partials) present and identical. **0 diff.**
- **RLS**: enabled on all 5 tables; 5 `service_role` ALL policies present and identical. **0 diff.**
- **Functions**: all 12 present with exact identity-argument signatures and SECURITY DEFINER flags
  (only `translation_order_transition_allowed` is SQL/IMMUTABLE/non-secdef — matches). **0 diff.**
- **Triggers**: all 7 present with identical timing/event/function bindings. **0 diff.**
- **Storage bucket** `translation-artifacts` exists, `public=false`. **0 diff.**
- **Canonical guard widening**: both guard bodies contain `PHASE2_TEST_` live. **0 diff.**

**Result: schema diff = 0.** No column was invented that is not in prod; no prod object is missing
from the migrations.

### Clean-replay CLI status — HONEST
A real `supabase db reset` clean replay was **NOT executed**: this environment has the `supabase`
CLI binary but **no local Postgres** (`psql` not found) and **no Docker** (`docker` not found), so
no local/ephemeral DB could be stood up and `supabase db reset` cannot run. No prod replay was
attempted (would be destructive — forbidden).

Therefore "clean replay reproduces prod" is proven by **DDL-vs-live-introspection equivalence** (the
field-by-field diff = 0 above), **NOT** by a live CLI replay. This is the strongest proof achievable
without a local Postgres, and it is exact for these forward-only/additive migrations because their
DDL is deterministic.

### Rollback
Each of the 4 files ends with a commented `ROLLBACK (manual only)` section (DROP triggers → DROP
functions → DROP tables, reverse FK order). Intentionally left in place: the additive
`canonical_overrides_source_check` widening and the additive `phase2_admin_cleanup` sentinel-purge
(documented inline as non-reverted, since narrowing them could invalidate live behavior).

## Migration-ledger naming drift (version vs file prefix)
The live `supabase_migrations.schema_migrations` ledger recorded the canonical/V2 migrations under
**MCP-generated timestamps** that differ from the local file prefixes:

| local file prefix | ledger version | name |
|---|---|---|
| 20260614000001 | **20260614005529** | translation_orders_v2_and_state_machine |
| 20260614000002 | **20260614005615** | translation_artifacts_outbox_and_security |
| 20260614000003 | **20260614005650** | widen_canonical_guards_for_phase2_sentinel |
| 20260614000004 | **20260614032529** | stripe_processed_events |

(The earlier canonical wave shows the same pattern, e.g. `20260613000000_*` is in the ledger as
`20260613194557`.)

### Consequence
`supabase db push` keys "already applied" on the **ledger version string**, not the filename. Because
the file prefixes (`20260614000001..`) are not in the ledger, `db push` would treat these 4 files as
**NEW, unapplied** migrations and run them. **This is harmless**: every statement is idempotent
(proven above) → re-apply is a clean no-op that leaves the schema identical (diff stays 0). It is,
however, cosmetically untidy — the ledger would then carry both the MCP-timestamp rows and new rows
for the file prefixes.

### Recommended owner action (NOT executed here)
Align the ledger to the file prefixes with `supabase migration repair` so the file-of-record and the
ledger agree and `db push` reports "up to date":

```
supabase migration repair --status applied 20260614000001 20260614000002 20260614000003 20260614000004
# (and, if the owner wants full alignment of the canonical wave, the 20260613000000.. prefixes too)
```

This was **deliberately NOT run** by the agent (no prod/ledger mutation performed by the agent for
the V2 work — they were already applied via PR #119). Repair is an owner decision because it edits
the live ledger. Even without repair, the schema is correct and stable.

## Applied-migration summary
- Prod already contains all 5 tables + 12 functions + 7 triggers + RLS/policies + bucket +
  2 additive widenings (applied by PR #119, ledger versions above).
- This PR adds the **code-of-record** for those objects into `main` as 4 idempotent files.
- **No runtime/V2 application code** is included (no `lib/translation/orders`, no routes, no V2 app code).
- **No prod mutation** was performed by the agent (read-only introspection only).

## Conclusion
`main` now reproduces the live production V2 schema. DDL-vs-live diff = **0**. Re-apply is safe on
both a clean DB and the existing prod DB. Ledger naming drift is documented; ledger repair is
recommended to the owner but not executed.
