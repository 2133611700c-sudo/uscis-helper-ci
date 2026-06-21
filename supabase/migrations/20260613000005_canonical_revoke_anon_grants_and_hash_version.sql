-- Migration: revoke broad anon/authenticated table grants on canonical tables;
--            add fields_hash_schema_version column for forward-safe hash verification.
-- Wave 1 Agent 1. Forward-only.
--
-- WHY (proven live, project rtfxrlountkoegsseukx):
--   - anon AND authenticated held FULL table grants (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
--     REFERENCES/TRIGGER) on canonical_documents + canonical_overrides — inherited from
--     Supabase's default GRANT ALL ON ALL TABLES TO anon, authenticated. Writes were only
--     blocked by RLS (anon INSERT → 42501, anon SELECT → 0 rows). That is a single line of
--     defense. We REVOKE the grants so privilege does not rely on RLS alone. These tables
--     are written ONLY by the server-side service-role path; anon/authenticated never touch
--     them directly. service_role retains its grants.
--   - fields_hash was bumped from v1 (finalValue+confidence only) to v2 (full provenance:
--     source, rawValue, normalizedValue, evidence, knowledge*, docType, product, schemaVersion).
--     We persist the hash schema version per row so a verifier never reinterprets a v1 hash
--     with the v2 algorithm. New rows default to 2.

-- ============================================================================
-- 1. Revoke broad anon / authenticated grants (defense-in-depth; RLS already denied writes)
-- ============================================================================

REVOKE ALL ON TABLE public.canonical_documents FROM anon;
REVOKE ALL ON TABLE public.canonical_documents FROM authenticated;
REVOKE ALL ON TABLE public.canonical_overrides FROM anon;
REVOKE ALL ON TABLE public.canonical_overrides FROM authenticated;

-- ============================================================================
-- 2. Persist fields_hash schema version (forward-safe verification gate)
-- ============================================================================

ALTER TABLE public.canonical_documents
  ADD COLUMN IF NOT EXISTS fields_hash_schema_version integer NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.canonical_documents.fields_hash_schema_version IS
  'Algorithm version of fields_hash. v2 covers full field provenance + doc identity; '
  'v1 (legacy) covered only finalValue+confidence+review state. A verifier must use the '
  'matching algorithm for the stored version — never reinterpret a v1 hash as v2.';

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- ALTER TABLE public.canonical_documents DROP COLUMN IF EXISTS fields_hash_schema_version;
-- GRANT ALL ON TABLE public.canonical_documents TO anon, authenticated;   -- (NOT recommended)
-- GRANT ALL ON TABLE public.canonical_overrides TO anon, authenticated;   -- (NOT recommended)
