-- ============================================================
-- Add Google Vision + DocAI providers to extraction_runs
-- Date: 2026-05-25
-- Adds google_vision and google_docai to provider CHECK
-- ============================================================

ALTER TABLE public.extraction_runs
  DROP CONSTRAINT IF EXISTS extraction_runs_provider_check;

ALTER TABLE public.extraction_runs
  ADD CONSTRAINT extraction_runs_provider_check
  CHECK (provider IN (
    'deepseek_vision',
    'tesseract_deepseek',
    'google_vision',
    'google_docai',
    'manual',
    NULL
  ));

COMMENT ON COLUMN public.extraction_runs.provider IS
  'OCR provider: google_vision (current default), google_docai (feature-flagged), deepseek_vision, tesseract_deepseek, manual';
