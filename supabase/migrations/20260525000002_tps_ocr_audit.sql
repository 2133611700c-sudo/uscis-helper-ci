-- ============================================================
-- TPS OCR Audit — lightweight audit for TPS wizard OCR calls
-- Date: 2026-05-25
-- No FK to translation_sessions (TPS doesn't use them)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tps_ocr_audit (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text        NOT NULL
    CHECK (provider IN ('google_vision', 'google_docai')),
  doc_type_hint   text,
  document_id     text,
  text_length     int         DEFAULT 0,
  page_count      int         DEFAULT 0,
  field_count     int         DEFAULT 0,
  rejected_fields jsonb       DEFAULT '[]',
  success         boolean     NOT NULL DEFAULT true,
  error_message   text,
  processing_ms   int         DEFAULT 0,
  brain_status    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tps_ocr_audit ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tps_ocr_audit'
      AND policyname = 'svc_tps_ocr_audit'
  ) THEN
    CREATE POLICY "svc_tps_ocr_audit" ON public.tps_ocr_audit
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tps_ocr_created
  ON public.tps_ocr_audit (created_at DESC);

COMMENT ON TABLE public.tps_ocr_audit IS
  'Audit log for TPS wizard OCR extraction runs. One row per /api/tps/ocr/extract call.';
