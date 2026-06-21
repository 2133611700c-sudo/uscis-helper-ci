-- Stage C Migration A
-- Extends manual_review_queue with translated output fields and TTL
-- Applied AFTER Stage B migration that creates the table.

alter table public.manual_review_queue
  add column if not exists translated_fields jsonb,
  add column if not exists file_url          text,
  add column if not exists expires_at        timestamptz not null default now() + interval '30 days';

-- Index for cron cleanup job
create index if not exists idx_mrq_expires_at
  on public.manual_review_queue (expires_at);

comment on column public.manual_review_queue.translated_fields is
  'Staff-entered or AI-suggested English translations, keyed same as source_fields';
comment on column public.manual_review_queue.file_url is
  'Supabase Storage path to uploaded document image (if stored)';
comment on column public.manual_review_queue.expires_at is
  'GDPR/CCPA auto-delete timestamp — cron deletes row + file after this date';
