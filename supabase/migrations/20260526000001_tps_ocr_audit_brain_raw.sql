-- 20260526000001_tps_ocr_audit_brain_raw.sql
--
-- Add brain_raw JSONB column to tps_ocr_audit so future debugging
-- of brain emissions has the data it needs.
--
-- Why this exists: Session 18 evidence analysis (28-run booklet stability
-- test) could not pinpoint the exact string the brain emitted for the dob
-- field across 28 runs. validateBrainField rejected it with reason
-- "date not parseable" in 100% of runs, but the actual emission string
-- (the value parseDate() rejected) is not preserved anywhere — only the
-- rejection metadata is. This makes the next investigation blind: we know
-- the brain produced SOMETHING unparseable, but we cannot see what.
--
-- Format: a JSONB blob containing the full brain output per field,
-- including:
--   - field: field key (dob, family_name, given_name, ...)
--   - source_value: the raw OCR text the brain was given
--   - final_value: the brain's own emission BEFORE validateBrainField/contract
--   - confidence: brain's confidence score
--   - validation_status: 'passed' | 'rejected:{reason}'
--   - contract_status: 'allowed' | 'forbidden:{reason}'
--
-- This is intentionally a single JSONB rather than a normalized
-- per-field table because (a) the schema of brain output is in flux as
-- prompts iterate, (b) one row per OCR run is correct unit of analysis,
-- (c) JSONB still supports per-field queries via -> and ->> operators
-- when needed.
--
-- HOW TO APPLY:
--   supabase db push                  # if using local migrations workflow
-- OR via SQL editor in Supabase Studio:
--   ALTER TABLE public.tps_ocr_audit ADD COLUMN brain_raw jsonb DEFAULT NULL;
--
-- After apply: update apps/web/src/lib/tps/ocrAudit.ts:OcrAuditInput
-- to include brain_raw, and call site in
-- apps/web/src/app/api/tps/ocr/extract/route.ts to pass it.
-- (Not done in this migration commit — code lands only after column exists,
-- to avoid breaking fire-and-forget audit writes between deploy and apply.)

ALTER TABLE public.tps_ocr_audit
  ADD COLUMN IF NOT EXISTS brain_raw jsonb DEFAULT NULL;

COMMENT ON COLUMN public.tps_ocr_audit.brain_raw IS
  'Brain-stage raw output per field, including final_value BEFORE validator/contract. Used to diagnose validation rejections like "date not parseable" where the rejected value itself is not otherwise preserved. May be NULL for rows written before this column existed or when DocumentBrain did not run.';
