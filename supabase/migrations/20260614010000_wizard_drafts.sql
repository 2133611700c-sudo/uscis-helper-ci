-- wizard_drafts — server-side encrypted wizard drafts (V1 criterion #9).
-- The browser keeps only an opaque token; the draft (PII: names/DOB/address/
-- document values, raw_cyrillic) lives here ENCRYPTED AT REST (AES-256-GCM,
-- see apps/web/src/lib/v1/wizardDraftCrypto.ts). Service-role only.
-- Additive + feature-flagged (SERVER_LEDGER_ENABLED, default OFF): creating this
-- table changes no current behavior.

create table if not exists public.wizard_drafts (
  token       text primary key,             -- opaque, unguessable (64 hex)
  product     text not null,                -- tps | reparole | ead | translation
  iv          text not null,                -- AES-GCM iv (hex)
  ciphertext  text not null,                -- encrypted draft (hex) — never plaintext
  tag         text not null,                -- AES-GCM auth tag (hex)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_wizard_drafts_expires_at on public.wizard_drafts (expires_at);

alter table public.wizard_drafts enable row level security;

-- No anon/authenticated policies: access is service-role only (RLS denies the rest).
-- Server routes use the service-role client; the browser never reads this table.

comment on table public.wizard_drafts is
  'Server-side encrypted wizard drafts. Browser holds only the opaque token. Ciphertext is AES-256-GCM; never store plaintext PII. Service-role only. TTL via expires_at + cron cleanup.';
