-- Extend user_corrections.correction_type CHECK constraint
-- Original: manual | transliteration | date_format | glossary | other
-- Adding:   ocr_error | controlling_spelling | one_document_exception
-- (values used by the correct-field API route)

ALTER TABLE public.user_corrections
  DROP CONSTRAINT IF EXISTS user_corrections_correction_type_check;

ALTER TABLE public.user_corrections
  ADD CONSTRAINT user_corrections_correction_type_check
  CHECK (correction_type IN (
    'manual',
    'transliteration',
    'date_format',
    'glossary',
    'other',
    'ocr_error',
    'controlling_spelling',
    'one_document_exception'
  ));
