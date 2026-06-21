-- Manual Review Queue v1 — additive hardening (Path B)
-- Date: 2026-05-09
--
-- Goal: extend existing manual_review_queue without breaking v0.
-- - No table rename
-- - No column drops
-- - No destructive data changes
-- - All existing rows remain valid
--
-- New surface:
-- 1. v1 columns on manual_review_queue (priority, module_type, reasons jsonb, etc.)
-- 2. Extended status check (pending/cancelled kept; new statuses added)
-- 3. updated_at column + trigger
-- 4. New manual_review_events audit table (PII-safe metadata only)
--
-- Compatibility map (handled in TS, documented here):
--   v0 'pending'   ↔ v1 'queued'    (kept as 'pending' for existing rows)
--   v0 'cancelled' ↔ v1 'rejected'  (kept as 'cancelled' for existing rows)
--   v0 'in_review' = v1 'in_review' (no change)
--   v0 'completed' = v1 'completed' (no change)
--
-- New v1 statuses: queued, assigned, needs_user_clarification,
--                  operator_completed, approved_for_render, rejected.

------------------------------------------------------------------------
-- 1. Add v1 columns to manual_review_queue (additive only)
------------------------------------------------------------------------

alter table public.manual_review_queue
  add column if not exists priority text not null default 'normal',
  add column if not exists module_type text,
  add column if not exists detected_document_type text,
  add column if not exists safe_summary text,
  add column if not exists assigned_to text,
  add column if not exists due_at timestamptz,
  add column if not exists reasons jsonb not null default '[]'::jsonb,
  add column if not exists session_id uuid,
  add column if not exists document_id uuid,
  add column if not exists updated_at timestamptz not null default now();

-- Priority check (separate ALTER so IF NOT EXISTS works on add column above)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_review_queue_priority_check'
      and conrelid = 'public.manual_review_queue'::regclass
  ) then
    alter table public.manual_review_queue
      add constraint manual_review_queue_priority_check
        check (priority in ('low', 'normal', 'high'));
  end if;
end$$;

------------------------------------------------------------------------
-- 2. Replace status CHECK with extended set (backward compatible)
------------------------------------------------------------------------

alter table public.manual_review_queue
  drop constraint if exists manual_review_queue_status_check;

alter table public.manual_review_queue
  add constraint manual_review_queue_status_check
    check (status in (
      -- v0 (kept verbatim — no row changes)
      'pending',
      'in_review',
      'completed',
      'cancelled',
      -- v1 additions
      'queued',
      'assigned',
      'needs_user_clarification',
      'operator_completed',
      'approved_for_render',
      'rejected'
    ));

------------------------------------------------------------------------
-- 3. Indexes for new columns
------------------------------------------------------------------------

create index if not exists idx_mrq_priority_created
  on public.manual_review_queue (priority, created_at desc);

create index if not exists idx_mrq_session_id
  on public.manual_review_queue (session_id);

create index if not exists idx_mrq_module_type
  on public.manual_review_queue (module_type);

create index if not exists idx_mrq_assigned_to_status
  on public.manual_review_queue (assigned_to, status);

------------------------------------------------------------------------
-- 4. updated_at trigger
------------------------------------------------------------------------

create or replace function public.tg_manual_review_queue_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_mrq_updated_at on public.manual_review_queue;
create trigger trg_mrq_updated_at
  before update on public.manual_review_queue
  for each row execute function public.tg_manual_review_queue_set_updated_at();

------------------------------------------------------------------------
-- 5. manual_review_events — audit trail (NEW table)
------------------------------------------------------------------------
-- PII RULE (enforced in application code, documented here):
-- metadata jsonb may contain ONLY:
--   field_name, reason_code, status, value_length, duration_ms, count, route,
--   from_status, to_status, ticket_id, session_id, module_type, priority.
-- metadata MUST NOT contain:
--   raw field values, names, DOB, addresses, document numbers, passport numbers,
--   OCR text, correction values, full email/phone, file paths.

create table if not exists public.manual_review_events (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.manual_review_queue(id) on delete cascade,
  session_id   uuid,
  event_type   text not null check (event_type in (
    'manual_review_queued',
    'manual_review_assigned',
    'manual_review_started',
    'manual_review_user_clarification_requested',
    'manual_review_completed',
    'manual_review_approved_for_render',
    'manual_review_rejected',
    'manual_review_cancelled'
  )),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_mre_ticket
  on public.manual_review_events (ticket_id, created_at desc);

create index if not exists idx_mre_event_type
  on public.manual_review_events (event_type, created_at desc);

create index if not exists idx_mre_session_id
  on public.manual_review_events (session_id, created_at desc);

alter table public.manual_review_events enable row level security;

drop policy if exists "service_role_only_events" on public.manual_review_events;

create policy "service_role_only_events"
  on public.manual_review_events
  for all
  using (auth.role() = 'service_role');

------------------------------------------------------------------------
-- 6. Comments / documentation
------------------------------------------------------------------------

comment on column public.manual_review_queue.priority is
  'Operator triage priority: low | normal | high. Default normal.';
comment on column public.manual_review_queue.module_type is
  'Document module type from registry (e.g. ua_internal_passport_booklet, manual_review_required).';
comment on column public.manual_review_queue.detected_document_type is
  'Raw classifier output before alias resolution. May differ from doc_type if alias was applied.';
comment on column public.manual_review_queue.safe_summary is
  'PII-redacted summary for queue list. MUST NOT contain names, DOB, document numbers, addresses, OCR text.';
comment on column public.manual_review_queue.assigned_to is
  'Operator identifier (email/handle) for ticket assignment. Nullable.';
comment on column public.manual_review_queue.due_at is
  'Soft SLA deadline. Nullable. Operator-set or computed from priority.';
comment on column public.manual_review_queue.reasons is
  'JSONB array of ManualReviewReason codes (string enum). Drives router UI and operator triage.';
comment on column public.manual_review_queue.session_id is
  'Translation session UUID. Nullable for legacy v0 rows.';
comment on column public.manual_review_queue.document_id is
  'Document UUID within the session. Nullable.';
comment on column public.manual_review_queue.updated_at is
  'Auto-maintained by trg_mrq_updated_at trigger.';

comment on table public.manual_review_events is
  'Audit trail for manual_review_queue tickets. metadata MUST contain ONLY safe fields: field_name, reason_code, status, value_length, duration_ms, count, route, from_status, to_status, ticket_id, session_id, module_type, priority. NEVER raw PII (names, DOB, document numbers, OCR text, full emails, addresses).';
