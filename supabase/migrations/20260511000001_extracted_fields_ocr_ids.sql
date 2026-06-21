-- Migration: Add OCR ID evidence columns to extracted_fields
-- v6.0 — Google Vision + DeepSeek Text ID-based mapping
--
-- New columns:
--   ocr_ids       jsonb    — array of OcrWord/OcrLine IDs that back this field
--                            e.g. ["w_0012"] or ["w_0020","w_0021","w_0022"]
--   combined_bbox jsonb    — [x0,y0,x1,y1] union bbox when ocr_ids.length > 1
--
-- These columns are nullable — pre-v6 rows keep NULL (no migration of old data).

ALTER TABLE public.extracted_fields
  ADD COLUMN IF NOT EXISTS ocr_ids      jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS combined_bbox jsonb DEFAULT NULL;

COMMENT ON COLUMN public.extracted_fields.ocr_ids IS
  'Array of OCR token IDs (OcrWord.id / OcrLine.id) from the Google Vision result that map to this field value. NULL for pre-v6 extractions.';

COMMENT ON COLUMN public.extracted_fields.combined_bbox IS
  'Union bounding box [x0,y0,x1,y1] normalised 0-1 when multiple OCR tokens were combined. NULL for single-token or missing-bbox fields.';

-- Drop the audit_logs event_type CHECK constraint entirely.
-- event_type is application-controlled; a CHECK constraint causes migration failures
-- whenever a new event type is introduced before the migration runs. No safety gain.
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
