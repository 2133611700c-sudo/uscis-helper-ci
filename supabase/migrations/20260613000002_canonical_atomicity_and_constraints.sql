-- Migration: canonical atomicity, UNIQUE constraints, atomic override RPC, security hardening
-- Purpose:
--   1. UNIQUE constraint on canonical_overrides(canonical_id, version) — prevents duplicate versions
--   2. UNIQUE constraint on canonical_documents(session_id, doc_type, fields_hash) — enables idempotent upsert
--   3. append_canonical_overrides_atomic RPC — atomic advisory-lock concurrency with optimistic check
--   4. Harden next_canonical_override_version — SET search_path, revoke from PUBLIC/anon/authenticated
--
-- Security: both functions run as SECURITY DEFINER with SET search_path = public.
-- Only service_role may EXECUTE either function.

-- ============================================================================
-- 1. UNIQUE constraint: canonical_overrides(canonical_id, version)
-- ============================================================================

ALTER TABLE public.canonical_overrides
  ADD CONSTRAINT canonical_overrides_canonical_id_version_unique
    UNIQUE (canonical_id, version);

COMMENT ON CONSTRAINT canonical_overrides_canonical_id_version_unique ON public.canonical_overrides IS
  'Guarantees that version numbers are unique per canonical_id. Prevents races that would '
  'assign the same version to two concurrent override inserts.';

-- ============================================================================
-- 2. UNIQUE constraint: canonical_documents(session_id, doc_type, fields_hash)
-- ============================================================================

ALTER TABLE public.canonical_documents
  ADD CONSTRAINT canonical_documents_session_doc_hash_unique
    UNIQUE (session_id, doc_type, fields_hash);

COMMENT ON CONSTRAINT canonical_documents_session_doc_hash_unique ON public.canonical_documents IS
  'Enables idempotent upsert: same session + doc_type + fields_hash always returns the same row id. '
  'Different content produces a different fields_hash and thus a new row. '
  'Used by persistCanonicalDocument: ON CONFLICT (session_id, doc_type, fields_hash) DO UPDATE '
  're-writes the content columns to their identical incoming values (product, document_session_id, '
  'fields_json, result_hash) so RETURNING yields the existing row id. There is no updated_at column '
  'on canonical_documents; the upsert performs no timestamp mutation.';

-- ============================================================================
-- 3. Atomic override append RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_canonical_overrides_atomic(
  p_canonical_id     uuid,
  p_expected_version integer,
  p_overrides        jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version integer;
  v_override        jsonb;
  v_idx             integer := 0;
BEGIN
  -- Advisory lock scoped to this transaction for this canonical_id.
  -- hashtext() produces a stable int8 from the uuid text, scoped to this txn only.
  PERFORM pg_advisory_xact_lock(hashtext(p_canonical_id::text));

  -- Read current max version under lock (COALESCE: 0 when no overrides yet)
  SELECT COALESCE(MAX(version), 0) INTO v_current_version
  FROM public.canonical_overrides
  WHERE canonical_id = p_canonical_id;

  -- Optimistic concurrency check
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'OVERRIDE_VERSION_CONFLICT expected=% current=%',
      p_expected_version, v_current_version
      USING ERRCODE = 'P0002';
  END IF;

  -- Insert each override with monotonically increasing version
  FOR v_override IN SELECT * FROM jsonb_array_elements(p_overrides)
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.canonical_overrides (
      canonical_id,
      field_key,
      override_value,
      source,
      reason,
      version,
      supersedes_id,
      confirmed,
      actor,
      original_rejection_reasons,
      created_at
    ) VALUES (
      p_canonical_id,
      v_override->>'field_key',
      v_override->>'override_value',
      v_override->>'source',
      v_override->>'reason',
      v_current_version + v_idx,
      NULLIF(v_override->>'supersedes_id', '')::uuid,
      COALESCE((v_override->>'confirmed')::boolean, false),
      v_override->>'actor',
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(v_override->'original_rejection_reasons', '[]'::jsonb)
        )
      ),
      now()
    );
  END LOOP;

  -- Return the new current version (highest version inserted, or unchanged if p_overrides=[])
  RETURN v_current_version + v_idx;
END;
$$;

COMMENT ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb) IS
  'Atomic, advisory-locked override append with optimistic concurrency check. '
  'Takes an advisory transaction lock on canonical_id, reads current MAX(version), '
  'checks it equals p_expected_version (raises P0002/OVERRIDE_VERSION_CONFLICT if not), '
  'then inserts each element of p_overrides JSON array with monotonically increasing versions. '
  'Returns the new MAX(version) after all inserts. '
  'SECURITY DEFINER + SET search_path = public. Only service_role may call this.';

-- Harden: revoke broad execute, grant only to service_role
REVOKE EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb)
  TO service_role;

-- ============================================================================
-- 4. Harden next_canonical_override_version (already exists from migration 000000)
-- ============================================================================
-- The function body is unchanged; we recreate it with explicit SET search_path
-- and tighten execute permissions.

CREATE OR REPLACE FUNCTION public.next_canonical_override_version(p_canonical_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version), 0) + 1
  FROM public.canonical_overrides
  WHERE canonical_id = p_canonical_id
$$;

COMMENT ON FUNCTION public.next_canonical_override_version(uuid) IS
  'Computes next monotonic version for canonical_overrides. '
  'SECURITY DEFINER + SET search_path = public (hardened — search_path injection safe). '
  'Superseded in production by append_canonical_overrides_atomic which holds an advisory '
  'lock and does the check-then-insert atomically. This function is retained for '
  'single-row internal system_correction writes that do not need concurrency protection.';

REVOKE EXECUTE ON FUNCTION public.next_canonical_override_version(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_canonical_override_version(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_canonical_override_version(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_canonical_override_version(uuid)
  TO service_role;

-- ============================================================================
-- ROLLBACK (execute manually only when rolling back this migration)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.append_canonical_overrides_atomic(uuid, integer, jsonb);
-- ALTER TABLE public.canonical_overrides DROP CONSTRAINT IF EXISTS canonical_overrides_canonical_id_version_unique;
-- ALTER TABLE public.canonical_documents DROP CONSTRAINT IF EXISTS canonical_documents_session_doc_hash_unique;
-- -- Restore next_canonical_override_version without search_path hardening if needed:
-- -- CREATE OR REPLACE FUNCTION public.next_canonical_override_version(p_canonical_id uuid)
-- -- RETURNS integer LANGUAGE sql SECURITY DEFINER AS
-- -- $$ SELECT COALESCE(MAX(version),0)+1 FROM public.canonical_overrides WHERE canonical_id=p_canonical_id; $$;
-- -- GRANT EXECUTE ON FUNCTION public.next_canonical_override_version(uuid) TO PUBLIC;
