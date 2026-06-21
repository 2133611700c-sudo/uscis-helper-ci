-- Stage C Migration B
-- Quality monitoring table — one row per /api/ocr/translate call

create table if not exists public.translation_quality_log (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  doc_type     text,
  source_lang  text,
  confidence   numeric(4,3),   -- 0.000–1.000
  latency_ms   int,            -- total DeepSeek call duration
  status       text not null,  -- 'ok' | 'error' | 'low_confidence'
  error        text            -- null on success
);

-- For quality dashboard queries: latest N rows, filter by doc_type/status
create index if not exists idx_tql_created_at
  on public.translation_quality_log (created_at desc);

create index if not exists idx_tql_status_doctype
  on public.translation_quality_log (status, doc_type);

-- Service role only — no client access
alter table public.translation_quality_log enable row level security;

create policy "service_role_only"
  on public.translation_quality_log
  for all
  using (auth.role() = 'service_role');
