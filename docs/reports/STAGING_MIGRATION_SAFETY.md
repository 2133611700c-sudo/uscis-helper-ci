# Staging migration safety scan (#160, step 8)

Date: 2026-06-17. Target staging ref: `rxnlpvldngxgdxkxoaaj` (us-west-1) — **≠** prod `rtfxrlountkoegsseukx`.

Scanned all 44 `supabase/migrations/*.sql` for destructive SQL and production-specific
executable values before any apply.

## Destructive-SQL matches: 38 — ALL safe for a fresh staging apply
- **Function bodies** (most): parameterized cleanup helpers like
  `DELETE FROM ... WHERE session_id LIKE p_prefix || '%'` inside `CREATE FUNCTION`
  bodies (test-data reset utilities). NOT executed at migration time.
- `20260509000000_unique_extracted_fields.sql`: `DELETE FROM public.extracted_fields`
  dedup before a UNIQUE constraint — on an EMPTY fresh DB it deletes 0 rows.
- `20260430024851_minimize_schema_v1.sql`: drops tables as part of an in-sequence
  schema-minimization (the tables it removes are created by earlier migrations in the
  same ordered apply). Expected, not data loss on fresh provision.
- No unguarded `DROP TABLE` / `TRUNCATE` against populated tables.

## Production-specific value matches: 6 — ALL benign
- `rtfxrlountkoegsseukx`: appears ONLY in SQL **comments** ("-- WHY (proven against
  LIVE project ...)") — documentation, never executed.
- "Messenginfo": product **content text** in a legal-disclaimer canonical answer.
- No `sk_live`/`pk_live`/`rk_live`, no hardcoded prod connection string.

## Verdict
SAFE to apply to the fresh isolated staging project. Application is performed by
`.github/workflows/staging-provision.yml` (confirm=APPLY) so all staging credentials
stay in GitHub Secrets. A hard guard aborts if the target ref ever equals prod.
