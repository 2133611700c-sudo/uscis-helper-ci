-- Monitoring engine schema migration
-- Apply via: supabase db push  OR  manually in Supabase dashboard SQL editor

-- ============================================================
-- monitoring_sources — what we watch
-- ============================================================
create table if not exists public.monitoring_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (
    source_type in (
      'uscis_rss',
      'uscis_page',
      'federal_register',
      'youtube_rss',
      'form_page'
    )
  ),
  url text not null unique,
  title text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  content_hash text,
  last_seen_id text,
  status text not null default 'active' check (
    status in ('active', 'paused', 'dead_link', 'changed')
  ),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists monitoring_sources_type_status_idx
  on public.monitoring_sources (source_type, status);

-- ============================================================
-- monitoring_alerts — events detected
-- ============================================================
create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.monitoring_sources(id) on delete cascade,
  alert_type text not null check (
    alert_type in ('new_item', 'content_changed', 'dead_link', 'edition_changed')
  ),
  severity text not null default 'info' check (
    severity in ('info', 'warning', 'critical')
  ),
  title text,
  description text,
  source_url text,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text
);

create index if not exists monitoring_alerts_detected_idx
  on public.monitoring_alerts (detected_at desc);

create index if not exists monitoring_alerts_unack_idx
  on public.monitoring_alerts (acknowledged_at)
  where acknowledged_at is null;

-- ============================================================
-- form_editions — track edition_date changes per USCIS form
-- ============================================================
create table if not exists public.form_editions (
  id uuid primary key default gen_random_uuid(),
  form_id text not null,
  edition_date text,
  detected_at timestamptz not null default now(),
  pdf_url text not null,
  pdf_hash text,
  is_current boolean not null default true
);

create index if not exists form_editions_form_id_idx
  on public.form_editions (form_id, detected_at desc);

-- ============================================================
-- dead_links_log — historical record of broken official URLs
-- ============================================================
create table if not exists public.dead_links_log (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  referenced_in text,
  last_ok_at timestamptz,
  detected_dead_at timestamptz not null default now(),
  http_status int,
  resolved_at timestamptz
);

create index if not exists dead_links_log_url_idx
  on public.dead_links_log (url, detected_dead_at desc);

-- ============================================================
-- RLS — service_role only access, no public reads
-- ============================================================
alter table public.monitoring_sources enable row level security;
alter table public.monitoring_alerts enable row level security;
alter table public.form_editions enable row level security;
alter table public.dead_links_log enable row level security;

-- Service role policies (PostgreSQL service_role bypasses RLS by default
-- but we explicitly deny anon to be safe)

create policy "deny anon access on monitoring_sources"
  on public.monitoring_sources for all to anon using (false);

create policy "deny anon access on monitoring_alerts"
  on public.monitoring_alerts for all to anon using (false);

create policy "deny anon access on form_editions"
  on public.form_editions for all to anon using (false);

create policy "deny anon access on dead_links_log"
  on public.dead_links_log for all to anon using (false);

-- ============================================================
-- Verification queries (run after migration)
-- ============================================================
-- SELECT count(*) FROM monitoring_sources;       -- should be 0 initially
-- SELECT count(*) FROM monitoring_alerts;        -- should be 0 initially
-- SELECT count(*) FROM form_editions;            -- should be 0 initially
-- SELECT count(*) FROM dead_links_log;           -- should be 0 initially
