-- ============================================================
-- Migration: Restore dropped tables + translation schema
-- Date: 2026-05-03
-- Restores: official_sources, canonical_answers (dropped in minimize_schema_v1)
-- Adds: translation_orders, translation_events
-- Note: source_type enum was dropped in minimize_schema_v1, using text instead
-- ============================================================

-- ============================================================
-- RESTORE: official_sources
-- ============================================================
create table if not exists public.official_sources (
  id            uuid primary key default gen_random_uuid(),
  url           text not null unique,
  source_type   text not null
    check (source_type in ('uscis_gov','dhs_gov','state_gov','federal_register','other_official')),
  title         text not null,
  language      text not null default 'en'
    check (language in ('en','uk','ru','es')),
  content_hash  text,
  last_fetched  timestamptz,
  last_changed  timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.official_sources is 'Registry of official government sources tracked by scanner.';

alter table public.official_sources enable row level security;

create policy "official_sources_select_all"
  on public.official_sources for select
  to anon, authenticated
  using (is_active = true);

create policy "official_sources_write_admin"
  on public.official_sources for all
  to service_role
  using (true) with check (true);

-- ============================================================
-- RESTORE: canonical_answers
-- ============================================================
create table if not exists public.canonical_answers (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  question_en     text not null,
  answer_en       text not null,
  question_uk     text,
  answer_uk       text,
  question_ru     text,
  answer_ru       text,
  category        text not null,
  source_ids      uuid[],
  verified_at     timestamptz,
  verified_by     uuid references public.profiles(id) on delete set null,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.canonical_answers is 'Vetted Q&A content. Must be verified before publishing.';

alter table public.canonical_answers enable row level security;

create policy "canonical_answers_select_published"
  on public.canonical_answers for select
  to anon, authenticated
  using (is_published = true);

create policy "canonical_answers_write_admin"
  on public.canonical_answers for all
  to service_role
  using (true) with check (true);

-- ============================================================
-- NEW: translation_orders
-- ============================================================
create table if not exists public.translation_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text unique not null default 'ORD-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  anon_user_id uuid not null,
  locale text not null default 'en',
  source_language text not null default 'uk',
  target_language text not null default 'en',
  document_type text,
  storage_key text,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending','processing','manual_review_required','completed','failed')),
  fields_extracted jsonb default '{}',
  fields_reviewed jsonb default '{}',
  pdf_storage_key text,
  status text not null default 'created'
    check (status in ('created','uploaded','processing','review','pdf_ready','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.translation_orders is 'Document translation orders — upload, OCR, field review, PDF generation.';

alter table public.translation_orders enable row level security;

create policy "service_role_all_translation_orders"
  on public.translation_orders
  for all to service_role
  using (true) with check (true);

-- ============================================================
-- NEW: translation_events
-- ============================================================
create table if not exists public.translation_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.translation_orders(order_id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

comment on table public.translation_events is 'Append-only audit log for translation order state changes.';

alter table public.translation_events enable row level security;

create policy "service_role_all_translation_events"
  on public.translation_events
  for all to service_role
  using (true) with check (true);
