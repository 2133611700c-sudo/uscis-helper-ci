-- Migration: Drop CHECK constraint on extracted_fields.evidence_type
-- v6.0 introduced new evidence types ('ocr_bbox', 'combined_ocr_bbox') that
-- violate the existing constraint. Application controls valid values; a DB
-- constraint here causes migration failures on every new evidence type added.
-- Consistent with the audit_logs_event_type_check removal in 20260511000001.

ALTER TABLE public.extracted_fields
  DROP CONSTRAINT IF EXISTS extracted_fields_evidence_type_check;
