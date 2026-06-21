-- Migration: canonical_documents and canonical_overrides
-- Purpose: Immutable persistence layer for CanonicalDocumentResult
--
-- Security invariants:
--   INV-07: confidence.final=1, reviewRequired=false, evidence=[], source='document_ocr'
--           must never be fabricated — only authoritative canonical results may carry these.
--   INV-11: finalValue=null MUST survive JSON round-trip; stored in fields_json as explicit null.
--           undefined finalValue stored as '__UNDEFINED__' sentinel, restored on load.
--   INV-12: No silent legacy fallback; all operations are explicit and observable.
--
-- RLS: service_role only; no UPDATE or DELETE granted to anyone (INSERT-only / append-only).
-- Anon has NO access to canonical_documents or canonical_overrides.

-- ============================================================================
-- Table: canonical_documents (INSERT-only, immutable base)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.canonical_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            text NOT NULL,
  document_session_id   text,
  product               text NOT NULL,
  doc_type              text NOT NULL,
  fields_json           jsonb NOT NULL,
  result_hash           text NOT NULL,
  fields_hash           text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.canonical_documents IS
  'Immutable base canonical document records. INSERT-only: no UPDATE or DELETE policy exists. '
  'RLS enforced — anon has no access. Each row is the authoritative canonical result for a '
  'document session. Overrides are tracked separately in canonical_overrides.';

CREATE INDEX IF NOT EXISTS idx_canonical_docs_session
  ON public.canonical_documents(session_id, doc_type);

CREATE INDEX IF NOT EXISTS idx_canonical_docs_doc_session
  ON public.canonical_documents(document_session_id)
  WHERE document_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_docs_created_at
  ON public.canonical_documents(created_at DESC);

-- RLS: deny UPDATE and DELETE via absence of policy (INSERT-only immutability)
ALTER TABLE public.canonical_documents ENABLE ROW LEVEL SECURITY;

-- service_role INSERT: allowed (write path from server-side routes)
CREATE POLICY "service_role_insert_canonical_documents"
  ON public.canonical_documents FOR INSERT TO service_role WITH CHECK (true);

-- service_role SELECT: allowed (read path from server-side routes)
CREATE POLICY "service_role_select_canonical_documents"
  ON public.canonical_documents FOR SELECT TO service_role USING (true);

-- UPDATE: DENIED — no policy grants UPDATE to anyone (immutable base rows)
-- DELETE: DENIED — no policy grants DELETE to anyone (audit trail must be preserved)
-- anon: DENIED — no policy grants any access to anon role

-- ============================================================================
-- Table: canonical_overrides (append-only user corrections with versioning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.canonical_overrides (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id              uuid NOT NULL REFERENCES public.canonical_documents(id),
  field_key                 text NOT NULL,
  -- override_value nullable: null = explicit C3 reject (INV-11); string = user-supplied value
  override_value            text,
  source                    text NOT NULL CHECK (source IN ('user_edit', 'certifier_override', 'system_correction')),
  reason                    text,
  -- Monotonic version per canonical_id; computed atomically via next_canonical_override_version()
  version                   integer NOT NULL,
  -- Audit chain: which override this supersedes (nullable = first override for a field)
  supersedes_id             uuid REFERENCES public.canonical_overrides(id),
  -- User must explicitly confirm before override is treated as effective (C3 null contract)
  confirmed                 boolean NOT NULL DEFAULT false,
  -- PII-free actor identifier (e.g. 'user', 'certifier', 'system')
  actor                     text,
  -- Preserved from base canonical field.reviewReasons for full audit chain
  original_rejection_reasons text[],
  created_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.canonical_overrides IS
  'Append-only corrections to canonical document fields. INSERT-only: no UPDATE or DELETE. '
  'RLS enforced — anon has no access. version is monotonic per canonical_id (computed by '
  'next_canonical_override_version()). confirmed=false means the override is staged but NOT '
  'yet effective. INV-11: override_value=null is an explicit C3 reject, never resurrected.';

CREATE INDEX IF NOT EXISTS idx_canonical_overrides_canonical_field
  ON public.canonical_overrides(canonical_id, field_key);

CREATE INDEX IF NOT EXISTS idx_canonical_overrides_version_desc
  ON public.canonical_overrides(canonical_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_overrides_supersedes
  ON public.canonical_overrides(supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_overrides_created_at
  ON public.canonical_overrides(canonical_id, created_at ASC);

-- RLS: deny UPDATE and DELETE via absence of policy (append-only)
ALTER TABLE public.canonical_overrides ENABLE ROW LEVEL SECURITY;

-- service_role INSERT: allowed (write path from server-side routes)
CREATE POLICY "service_role_insert_canonical_overrides"
  ON public.canonical_overrides FOR INSERT TO service_role WITH CHECK (true);

-- service_role SELECT: allowed (read path from server-side routes)
CREATE POLICY "service_role_select_canonical_overrides"
  ON public.canonical_overrides FOR SELECT TO service_role USING (true);

-- UPDATE: DENIED — no policy grants UPDATE to anyone (append-only audit trail)
-- DELETE: DENIED — no policy grants DELETE to anyone (audit trail must be preserved)
-- anon: DENIED — no policy grants any access to anon role

-- ============================================================================
-- Helper function: atomically compute next monotonic version for a canonical_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_canonical_override_version(p_canonical_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(version), 0) + 1
  FROM public.canonical_overrides
  WHERE canonical_id = p_canonical_id
$$;

COMMENT ON FUNCTION public.next_canonical_override_version IS
  'Computes next monotonic version for canonical_overrides. Use inside a transaction with '
  'INSERT to guarantee atomicity: INSERT INTO canonical_overrides (version, ...) VALUES '
  '(next_canonical_override_version(canonical_id), ...). '
  'SECURITY DEFINER to allow calling from service_role context.';

-- ============================================================================
-- ROLLBACK (commented out — execute manually only when rolling back this migration)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.next_canonical_override_version(uuid);
-- DROP TABLE IF EXISTS public.canonical_overrides;
-- DROP TABLE IF EXISTS public.canonical_documents;
