-- Migration: FK from translation_certification_audit.canonical_document_id → canonical_documents.id
-- Purpose: Enforce referential integrity so audit records cannot reference a non-existent canonical.
--
-- Safety: Verifies zero orphaned rows before adding the constraint.
-- ON DELETE RESTRICT + DEFERRABLE INITIALLY DEFERRED:
--   - RESTRICT: audit records are never silently orphaned when a canonical row would be deleted.
--   - DEFERRABLE INITIALLY DEFERRED: allows within-transaction ordering flexibility (e.g. bulk
--     loads where canonical is inserted in the same transaction as the audit row).
--
-- Requires: canonical_documents table from 20260613000000_canonical_documents_and_overrides.sql
--           canonical_document_id column from 20260613000001_certification_canonical_hash_binding.sql

-- ============================================================================
-- Guard: verify no orphaned canonical_document_id values exist
-- ============================================================================

DO $$
DECLARE
  v_orphaned_count integer;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_count
  FROM public.translation_certification_audit tca
  WHERE tca.canonical_document_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.canonical_documents cd
      WHERE cd.id = tca.canonical_document_id
    );

  IF v_orphaned_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add FK: % orphaned canonical_document_id value(s) found in '
      'translation_certification_audit. Resolve orphans before re-running this migration.',
      v_orphaned_count;
  END IF;
END $$;

-- ============================================================================
-- FK constraint: DEFERRABLE INITIALLY DEFERRED + ON DELETE RESTRICT
-- ============================================================================

ALTER TABLE public.translation_certification_audit
  ADD CONSTRAINT fk_certification_audit_canonical
    FOREIGN KEY (canonical_document_id)
    REFERENCES public.canonical_documents(id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON CONSTRAINT fk_certification_audit_canonical ON public.translation_certification_audit IS
  'Referential integrity: every non-null canonical_document_id must exist in canonical_documents. '
  'ON DELETE RESTRICT: canonical rows cannot be deleted while audit records reference them '
  '(audit trail must be preserved — immutability guarantee). '
  'DEFERRABLE INITIALLY DEFERRED: allows same-transaction insert of canonical + audit rows.';

-- ============================================================================
-- ROLLBACK (execute manually only when rolling back this migration)
-- ============================================================================
-- ALTER TABLE public.translation_certification_audit
--   DROP CONSTRAINT IF EXISTS fk_certification_audit_canonical;
