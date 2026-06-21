-- L1 observability — guard-block events + alert-escalation columns.
-- REPO↔PROD SYNC: this file reproduces the FINAL prod state, reconstructed from the
-- live schema via pg_get_* introspection (the owner applied the authoritative migration
-- "l1_observability_guard_block_events_and_alert_escalation" directly via Supabase MCP).
-- It is functionally bit-equal for a fresh DB; for a byte-exact CLI file run `supabase db pull`.
-- Idempotent. PII-free (no field values — gate + reason + field NAME + would_block only).

create table if not exists public.guard_block_events (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  gate_type     text        not null,
  doc_type      text,
  field_name    text,
  reason_code   text        not null,
  would_block   boolean     not null,
  session_id    uuid
);

create index if not exists idx_guard_block_events_created_at
  on public.guard_block_events using btree (created_at desc);
create index if not exists idx_guard_block_events_gate_created
  on public.guard_block_events using btree (gate_type, created_at desc);

alter table public.guard_block_events enable row level security;
-- service_role only by design (no client policy; INFO advisor rls_enabled_no_policy is expected).

-- COMMENT verbatim from prod (parity).
comment on table public.guard_block_events is
  'PII-free observability events for guard blocks. would_block=true counts even when flag OFF (shadow baseline).';

-- Alert-escalation state on the manual-review queue (L1 escalation timer suppression).
alter table public.manual_review_queue
  add column if not exists last_alert_stage text,      -- 'created' | 'second_alert' | 'third_channel'
  add column if not exists last_alerted_at  timestamptz;
