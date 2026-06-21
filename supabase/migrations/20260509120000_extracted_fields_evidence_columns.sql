-- Phase 1 / Phase 2 — add evidence provenance columns to extracted_fields
-- evidence_type: 'full_image' | 'zone_fallback'  (DeepSeek Vision vs Tesseract path)
-- bbox_status:   'exact' | 'approximate' | 'missing'  (bbox reliability from OCR)
-- Both nullable so existing rows remain valid; default NULL = unknown (pre-Phase-1 rows)

ALTER TABLE public.extracted_fields
  ADD COLUMN IF NOT EXISTS evidence_type TEXT
    CHECK (evidence_type IN ('full_image', 'zone_fallback'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bbox_status   TEXT
    CHECK (bbox_status IN ('exact', 'approximate', 'missing'))
    DEFAULT NULL;

COMMENT ON COLUMN public.extracted_fields.evidence_type IS
  'How the field was located: full_image = DeepSeek Vision bbox, zone_fallback = Tesseract text-only';
COMMENT ON COLUMN public.extracted_fields.bbox_status IS
  'Bbox reliability: exact = tight model bbox, approximate = low-confidence bbox, missing = no bbox (Tesseract)';
