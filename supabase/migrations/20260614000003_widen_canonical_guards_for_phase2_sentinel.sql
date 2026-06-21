-- Migration: widen canonical immutability guards to also honor PHASE2_TEST_ sentinel cleanup
-- Agent 1 (DB foundation). FORWARD-ONLY + ADDITIVE. CREATE OR REPLACE of two trigger functions
-- only — no table/constraint/trigger is altered or dropped.
--
-- WHY: phase2_admin_cleanup must delete sentinel canonical_documents/canonical_overrides rows that
-- Phase 2 live tests create with session_id prefixed 'PHASE2_TEST_'. The existing canonical guards
-- (migration 20260613000004) only release the immutability lock for 'WAVE1_TEST%' sessions. We
-- widen the sentinel allow-list to ALSO include 'PHASE2_TEST_%'. This strictly broadens which
-- SYNTHETIC sentinel rows may be cleaned; real applicant rows (no sentinel prefix) remain immutable.
-- The GUC gate (canonical.allow_admin_cleanup='on') is still required, so only the guarded
-- service-role cleanup functions can trigger a delete.

CREATE OR REPLACE FUNCTION public.canonical_documents_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('canonical.allow_admin_cleanup', true) = 'on'
     AND (COALESCE(OLD.session_id, '') LIKE 'WAVE1_TEST%'
          OR COALESCE(OLD.session_id, '') LIKE 'PHASE2_TEST_%') THEN
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
         WHERE d.id = OLD.canonical_id
           AND (d.session_id LIKE 'WAVE1_TEST%' OR d.session_id LIKE 'PHASE2_TEST_%')
       ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'CANONICAL_OVERRIDES_APPEND_ONLY: canonical_overrides rows are append-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.canonical_documents_immutable_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.canonical_overrides_append_only_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- ROLLBACK (manual only) — restore the WAVE1_TEST-only guards from migration 000004.
-- ============================================================================
