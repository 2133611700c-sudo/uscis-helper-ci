-- Stage B Migration — creates manual_review_queue table
-- This is the base table; Stage C migration 20260507073800 adds 3 more columns.

create table if not exists public.manual_review_queue (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  doc_type      text not null,
  source_lang   text not null default 'ru',
  contact_name  text,
  contact_email text,
  contact_phone text,
  source_fields jsonb not null default '{}'::jsonb,
  status        text not null default 'pending'
                check (status in ('pending', 'in_review', 'completed', 'cancelled')),
  reviewed_by   text,
  reviewed_at   timestamptz,
  notes         text
);

create index if not exists idx_mrq_status_created
  on public.manual_review_queue (status, created_at desc);

create index if not exists idx_mrq_email
  on public.manual_review_queue (contact_email);

alter table public.manual_review_queue enable row level security;

create policy "service_role_only"
  on public.manual_review_queue
  for all
  using (auth.role() = 'service_role');
