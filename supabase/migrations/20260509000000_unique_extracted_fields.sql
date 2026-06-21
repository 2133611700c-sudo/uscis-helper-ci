-- Add unique constraint on (session_id, field) so upsert-on-conflict works correctly.
-- Also removes any duplicate rows that may have been inserted before this constraint.
DO $$
BEGIN
  -- Remove duplicates keeping latest (by ctid) before adding constraint
  DELETE FROM public.extracted_fields a
  USING public.extracted_fields b
  WHERE a.ctid < b.ctid
    AND a.session_id = b.session_id
    AND a.field = b.field;
END$$;

ALTER TABLE public.extracted_fields
  DROP CONSTRAINT IF EXISTS uq_ef_session_field;

ALTER TABLE public.extracted_fields
  ADD CONSTRAINT uq_ef_session_field UNIQUE (session_id, field);
