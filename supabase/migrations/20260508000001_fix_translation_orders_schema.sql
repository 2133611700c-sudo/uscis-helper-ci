-- Fix translation_orders table schema
-- The table was previously created with an incomplete schema (missing email and other columns).
-- Since no real payment data exists (build was broken), we drop and recreate cleanly.

drop table if exists public.translation_orders cascade;

create table public.translation_orders (
  id                   uuid        primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  name                 text        not null,
  email                text        not null,
  phone                text,
  address              text,
  plan                 text        not null check (plan in ('basic', 'plus', 'premium')),
  spanish_copy         boolean     not null default false,
  locale               text        not null default 'en',
  signed_at            timestamptz,
  signature_method     text        check (signature_method in ('drawn_on_screen', 'manual_wet_signature')),
  certification_version text,
  status               text        not null default 'signed' check (status in ('signed', 'emailed', 'failed')),
  stripe_checkout_id   text
);

-- RLS: only service role can access
alter table public.translation_orders enable row level security;

create policy "Service role only" on public.translation_orders
  using (false);

-- Indexes for admin queries
create index translation_orders_email_idx      on public.translation_orders (email);
create index translation_orders_created_at_idx on public.translation_orders (created_at desc);
create index translation_orders_status_idx     on public.translation_orders (status);
