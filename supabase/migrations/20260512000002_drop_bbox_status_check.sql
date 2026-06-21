-- Migration: Drop CHECK constraint on extracted_fields.bbox_status
-- v6.0 introduced 'combined' bbox_status for multi-word OCR fields.
-- Application controls valid values; a DB CHECK causes failures when new
-- status types are introduced. Consistent with evidence_type_check removal.

ALTER TABLE public.extracted_fields
  DROP CONSTRAINT IF EXISTS extracted_fields_bbox_status_check;
