-- ============================================================
-- USCIS Helper — v1 Schema
-- All tables are new, independent of any previous project.
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

create type public.user_role as enum ('user', 'moderator', 'admin');
create type public.language_code as enum ('en', 'uk', 'ru');
create type public.order_status as enum ('pending', 'in_review', 'completed', 'rejected', 'refunded');
create type public.form_type as enum ('i765', 'i131', 'i134a', 'i90', 'n400', 'other');
create type public.risk_level as enum ('low', 'medium', 'high', 'critical');
create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'escalated');
create type public.source_type as enum ('uscis_gov', 'dhs_gov', 'state_gov', 'federal_register', 'other_official');
create type public.bot_platform as enum ('telegram', 'whatsapp', 'facebook');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'converted', 'spam');

-- ============================================================
-- TABLE: profiles
-- One row per authenticated user (mirrors auth.users)
-- ============================================================

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  language      language_code not null default 'en',
  role          user_role not null default 'user',
  phone         text,
  timezone      text default 'America/Los_Angeles',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'User profile data, extends auth.users.';

-- ============================================================
-- TABLE: user_sessions
-- Tracks web/bot session activity for analytics and audit.
-- ============================================================

create table public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  platform      text not null default 'web',  -- 'web' | 'telegram' | 'facebook'
  ip_hash       text,                          -- SHA-256 of IP, never raw IP
  user_agent    text,
  language      language_code not null default 'en',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  page_count    int not null default 0,
  created_at    timestamptz not null default now()
);

comment on table public.user_sessions is 'Session tracking for analytics. IP stored as hash only (CCPA/CPRA).';

-- ============================================================
-- TABLE: translations_orders
-- Document translation order lifecycle.
-- ============================================================

create table public.translations_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  source_language language_code not null,
  target_language language_code not null,
  document_type   text not null,               -- 'passport', 'birth_certificate', 'diploma', etc.
  page_count      int,
  status          order_status not null default 'pending',
  price_usd       numeric(8,2),
  paid_at         timestamptz,
  delivered_at    timestamptz,
  uscis_certified boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.translations_orders is 'Translation order lifecycle. USCIS-certified flag per 8 CFR 103.2(b)(3).';

-- ============================================================
-- TABLE: translation_files
-- Files attached to a translation order.
-- ============================================================

create table public.translation_files (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.translations_orders(id) on delete cascade,
  file_name   text not null,
  file_type   text not null,                   -- MIME type
  storage_key text not null unique,            -- Supabase Storage path
  is_source   boolean not null default true,   -- true = original, false = translated
  uploaded_at timestamptz not null default now()
);

comment on table public.translation_files is 'Files linked to translation orders, stored in Supabase Storage.';

-- ============================================================
-- TABLE: form_sessions
-- Tracks a user going through a guided form workflow.
-- ============================================================

create table public.form_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  form_type    form_type not null,
  language     language_code not null default 'en',
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  last_step    text,
  is_complete  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.form_sessions is 'Guided form session state. NOT legal advice — navigation assistance only.';

-- ============================================================
-- TABLE: form_answers
-- Individual answers within a form session.
-- ============================================================

create table public.form_answers (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.form_sessions(id) on delete cascade,
  question_key    text not null,
  answer_value    text,
  answered_at     timestamptz not null default now(),
  unique (session_id, question_key)
);

comment on table public.form_answers is 'Per-question answers for form sessions.';

-- ============================================================
-- TABLE: official_sources
-- Indexed USCIS/DHS/federal official content.
-- ============================================================

create table public.official_sources (
  id            uuid primary key default gen_random_uuid(),
  url           text not null unique,
  source_type   source_type not null,
  title         text not null,
  language      language_code not null default 'en',
  content_hash  text,                           -- SHA-256 of fetched body
  last_fetched  timestamptz,
  last_changed  timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.official_sources is 'Registry of official government sources tracked by scanner.';

-- ============================================================
-- TABLE: canonical_answers
-- Curated, vetted Q&A content in multiple languages.
-- ============================================================

create table public.canonical_answers (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  question_en     text not null,
  answer_en       text not null,
  question_uk     text,
  answer_uk       text,
  question_ru     text,
  answer_ru       text,
  category        text not null,               -- 'parole', 'tps', 'ead', 'travel', etc.
  source_ids      uuid[],                       -- references official_sources
  verified_at     timestamptz,
  verified_by     uuid references public.profiles(id) on delete set null,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.canonical_answers is 'Vetted Q&A content. Must be verified before publishing.';

-- ============================================================
-- TABLE: risk_flags
-- Detected risk signals per user or session.
-- ============================================================

create table public.risk_flags (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade,
  session_id    uuid references public.user_sessions(id) on delete set null,
  flag_type     text not null,                  -- 'name_mismatch', 'expired_status', 'travel_risk', etc.
  risk_level    risk_level not null default 'low',
  detail        jsonb,
  resolved      boolean not null default false,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.risk_flags is 'Risk signals. Does not constitute legal advice.';

-- ============================================================
-- TABLE: moderation_queue
-- Content flagged for human review.
-- ============================================================

create table public.moderation_queue (
  id              uuid primary key default gen_random_uuid(),
  source_table    text not null,               -- table name of flagged row
  source_id       uuid not null,
  flagged_reason  text not null,
  status          moderation_status not null default 'pending',
  assigned_to     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  reviewer_note   text,
  created_at      timestamptz not null default now()
);

comment on table public.moderation_queue is 'Human review queue for AI-generated or user-submitted content.';

-- ============================================================
-- TABLE: bot_threads
-- Bot conversation thread state (Telegram / WhatsApp / Facebook).
-- ============================================================

create table public.bot_threads (
  id              uuid primary key default gen_random_uuid(),
  platform        bot_platform not null,
  platform_id     text not null,               -- Telegram chat_id / WA thread id
  user_id         uuid references public.profiles(id) on delete set null,
  language        language_code not null default 'en',
  last_message_at timestamptz,
  message_count   int not null default 0,
  is_active       boolean not null default true,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (platform, platform_id)
);

comment on table public.bot_threads is 'Bot conversation threads per platform.';

-- ============================================================
-- TABLE: scanner_hits
-- Results from official-source content scanner.
-- ============================================================

create table public.scanner_hits (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.official_sources(id) on delete cascade,
  detected_at     timestamptz not null default now(),
  change_type     text not null,               -- 'new_content', 'updated', 'removed', 'deadline_detected'
  snippet         text,
  raw_diff        text,
  processed       boolean not null default false,
  canonical_id    uuid references public.canonical_answers(id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.scanner_hits is 'Changes detected on official sources by the scanner worker.';

-- ============================================================
-- TABLE: facebook_leads
-- Leads captured from Facebook (organic / ads / bot).
-- ============================================================

create table public.facebook_leads (
  id              uuid primary key default gen_random_uuid(),
  fb_user_id      text,                        -- hashed or opaque FB id, never real name
  platform_thread text,
  language        language_code,
  inquiry_text    text,
  status          lead_status not null default 'new',
  converted_user  uuid references public.profiles(id) on delete set null,
  source_campaign text,
  captured_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table public.facebook_leads is 'Facebook leads. fb_user_id is opaque/hashed — no PII.';

-- ============================================================
-- TABLE: audit_log
-- Immutable append-only log for sensitive operations.
-- ============================================================

create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,                   -- 'order.created', 'answer.published', etc.
  target_table text,
  target_id   uuid,
  detail      jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is 'Immutable audit trail. Never update or delete rows.';

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_user_sessions_user_id       on public.user_sessions(user_id);
create index idx_user_sessions_started_at    on public.user_sessions(started_at desc);
create index idx_translations_orders_user_id on public.translations_orders(user_id);
create index idx_translations_orders_status  on public.translations_orders(status);
create index idx_translation_files_order_id  on public.translation_files(order_id);
create index idx_form_sessions_user_id       on public.form_sessions(user_id);
create index idx_form_sessions_form_type     on public.form_sessions(form_type);
create index idx_form_answers_session_id     on public.form_answers(session_id);
create index idx_canonical_answers_category  on public.canonical_answers(category);
create index idx_canonical_answers_published on public.canonical_answers(is_published);
create index idx_risk_flags_user_id          on public.risk_flags(user_id);
create index idx_risk_flags_risk_level       on public.risk_flags(risk_level);
create index idx_moderation_queue_status     on public.moderation_queue(status);
create index idx_bot_threads_platform_id     on public.bot_threads(platform, platform_id);
create index idx_scanner_hits_source_id      on public.scanner_hits(source_id);
create index idx_scanner_hits_processed      on public.scanner_hits(processed);
create index idx_facebook_leads_status       on public.facebook_leads(status);
create index idx_audit_log_actor_id          on public.audit_log(actor_id);
create index idx_audit_log_created_at        on public.audit_log(created_at desc);
create index idx_audit_log_action            on public.audit_log(action);

-- ============================================================
-- TRIGGERS — updated_at auto-update
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger trg_translations_orders_updated_at
  before update on public.translations_orders
  for each row execute procedure public.set_updated_at();

create trigger trg_form_sessions_updated_at
  before update on public.form_sessions
  for each row execute procedure public.set_updated_at();

create trigger trg_canonical_answers_updated_at
  before update on public.canonical_answers
  for each row execute procedure public.set_updated_at();

create trigger trg_bot_threads_updated_at
  before update on public.bot_threads
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- TRIGGER — profiles auto-create on auth.users insert
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
