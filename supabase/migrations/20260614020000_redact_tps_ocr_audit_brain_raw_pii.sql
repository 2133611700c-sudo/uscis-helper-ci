-- ============================================================================
-- P0 SECURITY: redact applicant PII from tps_ocr_audit.brain_raw (IN PLACE).
-- ============================================================================
-- WHAT / WHY
--   tps_ocr_audit.brain_raw (jsonb) historically stored per-field applicant
--   values: source_value / final_value (names, DOB, document numbers, addresses)
--   and normalization_diagnostics[].input_raw (raw OCR text), plus source_line
--   (raw OCR line text). Storing applicant PII in an audit table is a privacy
--   defect. As of the app fix (ocrAuditSanitize.ts) NEW writes are PII-free.
--   This migration redacts EXISTING rows in place and installs a DB-side guard
--   so any future write that bypasses the app sanitizer is rejected.
--
-- SAFETY MODEL
--   - IDEMPOTENT: re-running is a no-op on already-redacted rows.
--   - TRANSACTIONAL: wrapped in BEGIN/COMMIT; all-or-nothing.
--   - REDACT IN PLACE: rows are NOT deleted; the brain_raw column is NOT
--     dropped. Only the PII keys are removed; technical keys are preserved
--     (field, present, confidence, requires_review, inferred, counts, reasons,
--     status, provider, model, etc.). A 'redacted_at' marker is added.
--
--   *** DO NOT auto-apply via MCP. Coordinator applies post-merge. ***
--
-- COUNT-FIRST (run this BEFORE applying, to size the blast radius):
--   select
--     count(*)                                                            as total_rows,
--     count(*) filter (where brain_raw::text ~ '"source_value"|"final_value"|"input_raw"|"source_line"') as rows_with_pii,
--     count(*) filter (where brain_raw ? 'redacted_at')                   as already_redacted
--   from public.tps_ocr_audit;
--
-- ROLLBACK NOTES
--   - Redaction is DESTRUCTIVE for the removed PII keys (intended; the PII
--     should not exist). There is no in-DB undo of the value removal. If a
--     backup is required, snapshot the table BEFORE applying:
--       create table tps_ocr_audit_preredact_bak as
--         select * from public.tps_ocr_audit;   -- drop after verification
--   - To remove the guard trigger only (without un-redacting):
--       drop trigger if exists trg_tps_ocr_audit_brain_raw_pii_guard on public.tps_ocr_audit;
--       drop function if exists public.tps_ocr_audit_redact_brain_raw(jsonb);
--       drop function if exists public.tps_ocr_audit_brain_raw_pii_guard();
-- ============================================================================

begin;

-- ── 1. Recursive redactor ────────────────────────────────────────────────
-- Walks a jsonb value and removes the forbidden PII keys at EVERY nesting
-- level (objects + arrays), preserving all other (technical) keys. Pure /
-- deterministic / immutable so it is safe to reuse from the guard trigger.
create or replace function public.tps_ocr_audit_redact_brain_raw(input jsonb)
returns jsonb
language plpgsql
immutable
as $func$
declare
  forbidden text[] := array[
    'source_value', 'final_value', 'input_raw', 'output_normalized',
    'source_line', 'raw_text', 'raw', 'value', 'raw_value', 'normalized_value',
    'text', 'line', 'line_text', 'ocr_text', 'mrz', 'mrz_line',
    'address', 'name', 'full_name', 'given_name', 'surname', 'patronymic',
    'dob', 'date_of_birth', 'document_number', 'doc_number', 'a_number',
    'passport_number'
  ];
  out_obj jsonb;
  out_arr jsonb;
  k       text;
  v       jsonb;
  elem    jsonb;
begin
  if input is null then
    return null;
  end if;

  case jsonb_typeof(input)
    when 'object' then
      out_obj := '{}'::jsonb;
      for k, v in select * from jsonb_each(input) loop
        -- Drop any forbidden key outright (case-insensitive); recurse otherwise.
        if lower(k) = any (forbidden) then
          continue;
        end if;
        out_obj := out_obj || jsonb_build_object(k, public.tps_ocr_audit_redact_brain_raw(v));
      end loop;
      return out_obj;
    when 'array' then
      out_arr := '[]'::jsonb;
      for elem in select * from jsonb_array_elements(input) loop
        out_arr := out_arr || jsonb_build_array(public.tps_ocr_audit_redact_brain_raw(elem));
      end loop;
      return out_arr;
    else
      -- scalar (string/number/bool/null): keep as-is
      return input;
  end case;
end;
$func$;

-- ── 2. Redact existing rows IN PLACE (idempotent) ─────────────────────────
-- Only touch rows that (a) have a brain_raw, and (b) still contain a PII key
-- OR are not yet marked redacted. Already-clean+marked rows are skipped.
update public.tps_ocr_audit
set brain_raw =
      public.tps_ocr_audit_redact_brain_raw(brain_raw)
      || jsonb_build_object('redacted_at', to_jsonb(now()))
where brain_raw is not null
  and (
        brain_raw::text ~ '"source_value"|"final_value"|"input_raw"|"output_normalized"|"source_line"'
        or not (brain_raw ? 'redacted_at')
      );

-- ── 3. DB-side guard: reject future writes carrying PII ───────────────────
-- Defence in depth: even if some future code path bypasses the app sanitizer,
-- the database refuses to store a brain_raw that mentions the core PII keys.
create or replace function public.tps_ocr_audit_brain_raw_pii_guard()
returns trigger
language plpgsql
as $guard$
begin
  if new.brain_raw is not null
     and new.brain_raw::text ~ '"source_value"|"final_value"|"input_raw"|"source_line"|"output_normalized"'
  then
    raise exception
      'tps_ocr_audit.brain_raw rejected: contains forbidden PII key (source_value/final_value/input_raw/source_line/output_normalized). Sanitize via sanitizeBrainRawForAudit() before insert.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_tps_ocr_audit_brain_raw_pii_guard on public.tps_ocr_audit;
create trigger trg_tps_ocr_audit_brain_raw_pii_guard
  before insert or update on public.tps_ocr_audit
  for each row
  execute function public.tps_ocr_audit_brain_raw_pii_guard();

-- ── 4. Retention note ─────────────────────────────────────────────────────
comment on column public.tps_ocr_audit.brain_raw is
  'Technical OCR audit diagnostics ONLY (field names, present/confidence/requires_review/inferred, counts, reasons, status, provider/model/latency). MUST NOT contain applicant values or raw OCR text. Enforced by trg_tps_ocr_audit_brain_raw_pii_guard. Sanitized in-app by sanitizeBrainRawForAudit(). Retention: technical-only, safe to keep for ops/forensics.';

commit;

-- ── POST-APPLY VERIFICATION (run AFTER commit) ────────────────────────────
--   select count(*) as residual_pii_rows
--   from public.tps_ocr_audit
--   where brain_raw::text ~ '"source_value"|"final_value"|"input_raw"|"source_line"';
--   -- expect 0
--   select count(*) as marked_redacted
--   from public.tps_ocr_audit where brain_raw ? 'redacted_at';
