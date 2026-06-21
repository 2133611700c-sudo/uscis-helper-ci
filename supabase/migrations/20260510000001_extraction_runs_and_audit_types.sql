-- ============================================================
-- Async OCR extraction job support
-- Date: 2026-05-10
-- 1. Expand audit_logs.event_type CHECK to include all OCR /
--    async-extraction event types (prior phases used these but
--    the constraint was never widened — runtime writes would fail)
-- 2. Create extraction_runs table
-- ============================================================

-- ── 1. Widen audit_logs.event_type constraint ─────────────────
--    PostgreSQL requires DROP CONSTRAINT / ADD CONSTRAINT to
--    modify a CHECK inline — cannot ALTER CHECK in place.

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_event_type_check
  CHECK (event_type IN (
    -- original set (v5 schema)
    'session_created',
    'document_uploaded',
    'extraction_started',
    'extraction_completed',
    'extraction_failed',
    'field_confirmed',
    'field_corrected',
    'certification_completed',
    'payment_initiated',
    'payment_completed',
    'payment_failed',
    'render_attempted',
    'render_blocked',
    'final_rendered',
    'download_started',
    'error',
    -- Phase 1 OCR events (added in prior session but constraint not updated)
    'ocr_started',
    'ocr_completed',
    'ocr_failed',
    'ocr_retake_required',
    'render_blocked_completeness_audit',
    -- Async extraction job events (this migration)
    'extraction_queued',
    'extraction_processing',
    'extraction_failed_timeout',
    'extraction_manual_review_required'
  ));

-- ── 2. extraction_runs ───────────────────────────────────────
-- One row per async OCR job kicked off by POST /ocr-from-storage.
-- Lifecycle: queued → processing → completed | failed | retake_required | manual_review_required
-- The route returns 202 immediately with the run id; UI polls
-- GET /api/translation/[sessionId]/extraction-status/[runId].

CREATE TABLE IF NOT EXISTS public.extraction_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text        NOT NULL REFERENCES public.translation_sessions(session_id) ON DELETE CASCADE,
  document_id     uuid        REFERENCES public.translation_documents(id) ON DELETE SET NULL,

  -- Status lifecycle
  status          text        NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'processing',
      'completed',
      'failed',
      'retake_required',
      'manual_review_required'
    )),

  -- Provider used
  provider        text
    CHECK (provider IN ('deepseek_vision', 'tesseract_deepseek', 'manual', NULL)),

  -- OCR results (written on completion)
  raw_text        text,              -- up to 8000 chars for audit trail
  warnings        jsonb   DEFAULT '[]',
  confidence      numeric(4,3)
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),

  -- Retake state
  retake_count    int     NOT NULL DEFAULT 0,
  image_quality   jsonb,             -- { overall: 0.9, issues: [] }

  -- Error state
  error_message   text,              -- user-facing message (no raw stack traces)
  error_detail    text,              -- internal detail for debugging

  -- Timestamps
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.extraction_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_extraction_runs" ON public.extraction_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_er_session    ON public.extraction_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_er_status     ON public.extraction_runs (status);
CREATE INDEX IF NOT EXISTS idx_er_created    ON public.extraction_runs (created_at DESC);

COMMENT ON TABLE  public.extraction_runs IS
  'Async OCR job tracking. One row per POST /ocr-from-storage call. UI polls for status.';
COMMENT ON COLUMN public.extraction_runs.status IS
  'queued=created, processing=OCR running, completed=fields written, failed=hard error, retake_required=low quality, manual_review_required=all paths exhausted';
COMMENT ON COLUMN public.extraction_runs.raw_text IS
  'Reconstructed OCR text stored for audit trail and potential replay (8000 char cap)';
COMMENT ON COLUMN public.extraction_runs.error_message IS
  'User-readable message. Must not contain raw OCR errors or stack traces.';
