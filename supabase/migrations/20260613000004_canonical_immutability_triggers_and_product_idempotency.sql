-- Migration: canonical immutability triggers + product-scoped idempotency + 64-bit advisory lock
-- Wave 1 Agent 1 (DB/concurrency/security hardening). Forward-only. No data migration.
--
-- WHY (proven against LIVE project rtfxrlountkoegsseukx, role=postgres/service_role):
--   1. IMMUTABILITY WAS NOT ENFORCED. RLS denies UPDATE/DELETE only to non-bypassing
--      roles. service_role bypasses RLS; postgres owns the tables. A live probe proved
--      UPDATE canonical_documents SUCCEEDED, UPDATE/DELETE canonical_overrides SUCCEEDED.
--      RLS-absence-of-policy is necessary but NOT sufficient. We add BEFORE UPDATE/DELETE
--      triggers that RAISE typed exceptions — triggers fire for EVERY role incl. owner.
--   2. CROSS-PRODUCT IDEMPOTENCY COLLISION. UNIQUE(session_id, doc_type, fields_hash)
--      omits product. session_id is reused across tps/translation/reparole/ead. A live
--      probe proved a 'translation' persist OVERWROTE a 'tps' canonical row sharing
--      session+doc_type+fields_hash (one row remained, product flipped). We make the
--      uniqueness product-scoped: UNIQUE(session_id, product, doc_type, fields_hash).
--   3. Advisory lock used 32-bit hashtext(uuid::text) — collision-prone (distinct UUIDs
--      can share a lock key → needless serialization). Upgraded to two-key 64-bit
--      bigint lock via hashtextextended for fewer false collisions. Correctness was
--      already guaranteed by UNIQUE(canonical_id,version) + in-lock version check;
--      this only reduces contention.
--
-- A guarded admin cleanup function is provided so synthetic WAVE1_TEST_* rows can be
-- removed despite the immutability triggers (service_role-only, sentinel-scoped).

-- ============================================================================
-- 1. Immutability trigger functions (typed exceptions)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.canonical_documents_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow guarded admin cleanup to bypass for sentinel synthetic test rows only.
  IF current_setting('canonical.allow_admin_cleanup', true) = 'on'
     AND COALESCE(OLD.session_id, '') LIKE 'WAVE1_TEST%' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'CANONICAL_BASE_IMMUTABLE: canonical_documents rows are insert-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_overrides_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('canonical.allow_admin_cleanup', true) = 'on' THEN
    IF TG_OP = 'DELETE'
       AND EXISTS (
         SELECT 1 FROM public.canonical_documents d
         WHERE d.id = OLD.canonical_id AND d.session_id LIKE 'WAVE1_TEST%'
       ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'CANONICAL_OVERRIDES_APPEND_ONLY: canonical_overrides rows are append-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.canonical_documents_immutable_guard() IS
  'BEFORE UPDATE/DELETE guard on canonical_documents. Fires for ALL roles including '
  'table owner and service_role (RLS bypass does not bypass triggers). Raises '
  'CANONICAL_BASE_IMMUTABLE. Only a guarded admin cleanup (GUC canonical.allow_admin_cleanup=on) '
  'may DELETE sentinel WAVE1_TEST% rows.';
COMMENT ON FUNCTION public.canonical_overrides_append_only_guard() IS
  'BEFORE UPDATE/DELETE guard on canonical_overrides. Append-only. Raises '
  'CANONICAL_OVERRIDES_APPEND_ONLY. Guarded admin cleanup may DELETE rows of sentinel '
  'WAVE1_TEST% canonical documents only.';

-- ============================================================================
-- 2. Attach triggers (BEFORE UPDATE and BEFORE DELETE on both tables)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_canonical_documents_no_update ON public.canonical_documents;
DROP TRIGGER IF EXISTS trg_canonical_documents_no_delete ON public.canonical_documents;
CREATE TRIGGER trg_canonical_documents_no_update
  BEFORE UPDATE ON public.canonical_documents
  FOR EACH ROW EXECUTE FUNCTION public.canonical_documents_immutable_guard();
CREATE TRIGGER trg_canonical_documents_no_delete
  BEFORE DELETE ON public.canonical_documents
  FOR EACH ROW EXECUTE FUNCTION public.canonical_documents_immutable_guard();

DROP TRIGGER IF EXISTS trg_canonical_overrides_no_update ON public.canonical_overrides;
DROP TRIGGER IF EXISTS trg_canonical_overrides_no_delete ON public.canonical_overrides;
CREATE TRIGGER trg_canonical_overrides_no_update
  BEFORE UPDATE ON public.canonical_overrides
  FOR EACH ROW EXECUTE FUNCTION public.canonical_overrides_append_only_guard();
CREATE TRIGGER trg_canonical_overrides_no_delete
  BEFORE DELETE ON public.canonical_overrides
  FOR EACH ROW EXECUTE FUNCTION public.canonical_overrides_append_only_guard();

-- Lock down the guard functions: nobody calls them directly.
REVOKE EXECUTE ON FUNCTION public.canonical_documents_immutable_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.canonical_overrides_append_only_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Product-scoped idempotency uniqueness
-- ============================================================================
-- IMPORTANT: persistCanonicalDocument's upsert performs an UPDATE on conflict. With the
-- immutability trigger above, an UPDATE that changes nothing would still RAISE. To keep
-- idempotent upsert working WITHOUT mutating the immutable base, the application uses
-- ON CONFLICT ... DO NOTHING and then re-selects the existing row (see persistence/index.ts).
-- The new unique key makes the conflict target product-aware.

-- Add the product-scoped unique constraint. The old (session_id, doc_type, fields_hash)
-- constraint is DROPPED because it would still force cross-product collisions on the
-- INSERT itself (before ON CONFLICT can target the new key).
ALTER TABLE public.canonical_documents
  DROP CONSTRAINT IF EXISTS canonical_documents_session_doc_hash_unique;

-- Replay-safe: skip if the product-scoped constraint already exists (db push idempotency).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_documents_session_product_doc_hash_unique'
      AND conrelid = 'public.canonical_documents'::regclass
  ) THEN
    ALTER TABLE public.canonical_documents
      ADD CONSTRAINT canonical_documents_session_product_doc_hash_unique
        UNIQUE (session_id, product, doc_type, fields_hash);
  END IF;
END $$;

COMMENT ON CONSTRAINT canonical_documents_session_product_doc_hash_unique ON public.canonical_documents IS
  'Product-scoped idempotency key. session_id is reused across products (tps/translation/'
  'reparole/ead); including product prevents one product''s canonical persist from colliding '
  'with another that shares session+doc_type+fields_hash. Conflict target for the idempotent '
  'INSERT ... ON CONFLICT DO NOTHING re-select in persistCanonicalDocument.';

-- ============================================================================
-- 4. 64-bit two-key advisory lock in append_canonical_overrides_atomic
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_canonical_overrides_atomic(
  p_canonical_id     uuid,
  p_expected_version integer,
  p_overrides        jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version integer;
  v_override        jsonb;
  v_idx             integer := 0;
  v_lock_key        bigint;
BEGIN
  -- 64-bit single-key transaction advisory lock derived from the UUID via hashtextextended
  -- (returns bigint). Using the bigint overload of pg_advisory_xact_lock avoids the 32-bit
  -- hashtext collision problem AND the int4-overflow that a hi/lo split would cause for
  -- UUIDs whose hash high word exceeds int4 range. Scoped to this transaction only.
  v_lock_key := hashtextextended(p_canonical_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(version), 0) INTO v_current_version
  FROM public.canonical_overrides
  WHERE canonical_id = p_canonical_id;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'OVERRIDE_VERSION_CONFLICT expected=% current=%',
      p_expected_version, v_current_version
      USING ERRCODE = 'P0002';
  END IF;

  FOR v_override IN SELECT * FROM jsonb_array_elements(p_overrides)
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.canonical_overrides (
      canonical_id, field_key, override_value, source, reason, version,
      supersedes_id, confirmed, actor, original_rejection_reasons, created_at
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

  RETURN v_current_version + v_idx;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_canonical_overrides_atomic(uuid, integer, jsonb) TO service_role;

-- ============================================================================
-- 5. Guarded admin cleanup for synthetic sentinel rows (service_role only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.canonical_admin_cleanup_sentinel(p_session_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_deleted integer := 0;
BEGIN
  -- Hard guard: only sentinel synthetic sessions may ever be touched.
  IF p_session_prefix IS NULL OR p_session_prefix NOT LIKE 'WAVE1_TEST%' THEN
    RAISE EXCEPTION 'CANONICAL_ADMIN_CLEANUP_FORBIDDEN: prefix must start with WAVE1_TEST';
  END IF;
  PERFORM set_config('canonical.allow_admin_cleanup', 'on', true);
  DELETE FROM public.canonical_overrides o
   USING public.canonical_documents d
   WHERE o.canonical_id = d.id AND d.session_id LIKE p_session_prefix || '%';
  DELETE FROM public.canonical_documents WHERE session_id LIKE p_session_prefix || '%';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('canonical.allow_admin_cleanup', 'off', true);
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.canonical_admin_cleanup_sentinel(text) IS
  'Service-role-only guarded cleanup of synthetic WAVE1_TEST* canonical rows. Sets the '
  'GUC the immutability triggers honor, then deletes overrides + documents for the sentinel '
  'session prefix only. Refuses any non-WAVE1_TEST prefix. Never touches real applicant rows.';

REVOKE EXECUTE ON FUNCTION public.canonical_admin_cleanup_sentinel(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_admin_cleanup_sentinel(text) TO service_role;

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_canonical_documents_no_update ON public.canonical_documents;
-- DROP TRIGGER IF EXISTS trg_canonical_documents_no_delete ON public.canonical_documents;
-- DROP TRIGGER IF EXISTS trg_canonical_overrides_no_update ON public.canonical_overrides;
-- DROP TRIGGER IF EXISTS trg_canonical_overrides_no_delete ON public.canonical_overrides;
-- DROP FUNCTION IF EXISTS public.canonical_documents_immutable_guard();
-- DROP FUNCTION IF EXISTS public.canonical_overrides_append_only_guard();
-- DROP FUNCTION IF EXISTS public.canonical_admin_cleanup_sentinel(text);
-- ALTER TABLE public.canonical_documents DROP CONSTRAINT IF EXISTS canonical_documents_session_product_doc_hash_unique;
-- ALTER TABLE public.canonical_documents ADD CONSTRAINT canonical_documents_session_doc_hash_unique UNIQUE (session_id, doc_type, fields_hash);
