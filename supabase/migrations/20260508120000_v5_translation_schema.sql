-- ============================================================
-- v5.0 Translation Engine Schema
-- Date: 2026-05-08
-- Adds all tables required for the vertical slice proof:
--   translation_sessions, translation_documents, extracted_fields,
--   numeric_evidence, user_corrections, certification_records,
--   translation_payments, final_renders, audit_logs
-- ============================================================

-- ── 1. translation_sessions ──────────────────────────────────
-- Core session (replaces old translation_orders for v5 flow)
create table if not exists public.translation_sessions (
  id                    uuid        primary key default gen_random_uuid(),
  session_id            text        unique not null default 'SES-' || upper(substr(gen_random_uuid()::text,1,8)),
  locale                text        not null default 'en',
  source_language       text        not null default 'Ukrainian',
  target_language       text        not null default 'English',
  doc_type              text,                        -- ua_passport_internal | ua_passport_booklet | etc.
  status                text        not null default 'created'
    check (status in ('created','uploaded','extracted','review','certified','paid','rendered','failed')),
  scope_title           text,
  uploaded_pages        int         not null default 0,
  total_pages           int,
  payment_confirmed     boolean     not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.translation_sessions enable row level security;
create policy "svc_translation_sessions" on public.translation_sessions
  for all to service_role using (true) with check (true);
create index if not exists idx_ts_session_id on public.translation_sessions (session_id);
create index if not exists idx_ts_status     on public.translation_sessions (status);
create index if not exists idx_ts_created    on public.translation_sessions (created_at desc);

-- ── 2. translation_documents ─────────────────────────────────
-- One row per uploaded file (supports multi-page)
create table if not exists public.translation_documents (
  id            uuid        primary key default gen_random_uuid(),
  session_id    text        not null references public.translation_sessions(session_id) on delete cascade,
  storage_key   text        not null,            -- Supabase storage path
  original_name text,
  mime_type     text,
  file_size_bytes int,
  page_count    int,
  upload_validated boolean not null default false,
  validation_errors jsonb   default '[]',
  created_at    timestamptz not null default now()
);

alter table public.translation_documents enable row level security;
create policy "svc_translation_documents" on public.translation_documents
  for all to service_role using (true) with check (true);
create index if not exists idx_td_session on public.translation_documents (session_id);

-- ── 3. extracted_fields ──────────────────────────────────────
-- Drop old incompatible schema (field_key/field_value from init migration).
-- CASCADE removes any dependent objects (indexes, FKs).
drop table if exists public.extracted_fields cascade;

-- One row per extracted field (normalized, not JSONB blob)
create table public.extracted_fields (
  id                uuid        primary key default gen_random_uuid(),
  session_id        text        not null references public.translation_sessions(session_id) on delete cascade,
  field             text        not null,        -- e.g. 'surname', 'date_of_birth'
  source_label      text,                        -- label as printed in doc
  source_zone       text,                        -- zone descriptor
  raw_value         text,                        -- verbatim from doc
  normalized_value  text,                        -- English normalized
  language_layer    text        default 'uk'
    check (language_layer in ('uk','ru','mixed','unknown')),
  confidence        numeric(4,3) not null default 1.0
    check (confidence between 0 and 1),
  review_required   boolean     not null default false,
  confirmed         boolean     not null default false,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.extracted_fields enable row level security;
create policy "svc_extracted_fields" on public.extracted_fields
  for all to service_role using (true) with check (true);
create index if not exists idx_ef_session on public.extracted_fields (session_id);
create index if not exists idx_ef_field   on public.extracted_fields (session_id, field);

-- ── 4. numeric_evidence ──────────────────────────────────────
-- Bbox / source trace per field (separate for large payloads)
create table if not exists public.numeric_evidence (
  id            uuid        primary key default gen_random_uuid(),
  field_id      uuid        not null references public.extracted_fields(id) on delete cascade,
  session_id    text        not null,
  bbox_x0       numeric,                         -- normalized 0–1
  bbox_y0       numeric,
  bbox_x1       numeric,
  bbox_y1       numeric,
  page_number   int         not null default 1,
  crop_storage_key text,                         -- optional pre-cropped image
  raw_ocr_text  text,
  created_at    timestamptz not null default now()
);

alter table public.numeric_evidence enable row level security;
create policy "svc_numeric_evidence" on public.numeric_evidence
  for all to service_role using (true) with check (true);
create index if not exists idx_ne_field   on public.numeric_evidence (field_id);
create index if not exists idx_ne_session on public.numeric_evidence (session_id);

-- ── 5. user_corrections ──────────────────────────────────────
-- Append-only correction log — never UPDATE, only INSERT
create table if not exists public.user_corrections (
  id            uuid        primary key default gen_random_uuid(),
  session_id    text        not null references public.translation_sessions(session_id) on delete cascade,
  field_id      uuid        references public.extracted_fields(id),
  field         text        not null,
  old_value     text,
  new_value     text        not null,
  reason        text,                            -- user's stated reason
  correction_type text      not null default 'manual'
    check (correction_type in ('manual','transliteration','date_format','glossary','other')),
  corrected_by  text        default 'user',
  version       int         not null default 1,
  created_at    timestamptz not null default now()
);

alter table public.user_corrections enable row level security;
create policy "svc_user_corrections" on public.user_corrections
  for all to service_role using (true) with check (true);
create index if not exists idx_uc_session on public.user_corrections (session_id);
create index if not exists idx_uc_field   on public.user_corrections (session_id, field);

-- ── 6. certification_records ─────────────────────────────────
create table if not exists public.certification_records (
  id                      uuid        primary key default gen_random_uuid(),
  session_id              text        unique not null references public.translation_sessions(session_id) on delete cascade,
  signer_full_name        text        not null,
  signer_address          text,
  signer_phone            text,
  signer_email            text,
  source_language         text        not null default 'Ukrainian',
  target_language         text        not null default 'English',
  language_pair_confirmed boolean     not null default false,
  statement               text        not null,  -- full 8 CFR §103.2(b)(3) statement
  signature_typed_name    text        not null,
  signature_method        text        default 'typed'
    check (signature_method in ('typed','drawn','wet')),
  certification_version   text        not null default 'v1.0-8cfr-2026',
  signed_at               timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

alter table public.certification_records enable row level security;
create policy "svc_certification_records" on public.certification_records
  for all to service_role using (true) with check (true);
create index if not exists idx_cr_session on public.certification_records (session_id);

-- ── 7. translation_payments ──────────────────────────────────
create table if not exists public.translation_payments (
  id                    uuid        primary key default gen_random_uuid(),
  session_id            text        not null references public.translation_sessions(session_id) on delete cascade,
  stripe_checkout_id    text        unique,
  stripe_payment_intent text,
  plan                  text        not null check (plan in ('basic','plus','premium')),
  amount_cents          int         not null,
  currency              text        not null default 'usd',
  status                text        not null default 'pending'
    check (status in ('pending','paid','failed','refunded')),
  paid_at               timestamptz,
  created_at            timestamptz not null default now()
);

alter table public.translation_payments enable row level security;
create policy "svc_translation_payments" on public.translation_payments
  for all to service_role using (true) with check (true);
create index if not exists idx_tp_session  on public.translation_payments (session_id);
create index if not exists idx_tp_checkout on public.translation_payments (stripe_checkout_id);

-- ── 8. final_renders ─────────────────────────────────────────
create table if not exists public.final_renders (
  id              uuid        primary key default gen_random_uuid(),
  session_id      text        not null references public.translation_sessions(session_id) on delete cascade,
  storage_key     text        not null,          -- Supabase storage path for PDF
  content_type    text        not null default 'application/pdf',
  file_size_bytes int,
  qa_passed       boolean     not null default false,
  qa_report       jsonb       default '{}',
  download_count  int         not null default 0,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.final_renders enable row level security;
create policy "svc_final_renders" on public.final_renders
  for all to service_role using (true) with check (true);
create index if not exists idx_fr_session on public.final_renders (session_id);

-- ── 9. audit_logs ────────────────────────────────────────────
-- Append-only. Every action in the system is recorded here.
create table if not exists public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text,                              -- null allowed for system events
  event_type  text        not null
    check (event_type in (
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
      'error'
    )),
  actor       text        not null default 'system',
  metadata    jsonb       default '{}',
  created_at  timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
create policy "svc_audit_logs" on public.audit_logs
  for all to service_role using (true) with check (true);
create index if not exists idx_al_session    on public.audit_logs (session_id);
create index if not exists idx_al_event_type on public.audit_logs (event_type);
create index if not exists idx_al_created    on public.audit_logs (created_at desc);

-- ── Helper: auto-update updated_at on translation_sessions ───
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ts_updated_at on public.translation_sessions;
create trigger trg_ts_updated_at
  before update on public.translation_sessions
  for each row execute function public.set_updated_at();
