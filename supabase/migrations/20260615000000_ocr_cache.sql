-- ocr_cache — content-addressed OCR/AI result cache (V1 Phase 7-B/C, P2).
--
-- PURPOSE: relieve Google Vision HTTP 429 by serving an identical OCR/AI result
-- for identical input bytes+pipeline instead of re-paying the provider.
--
-- KEY (content-addressed, NO PII, NO user/session id):
--   key_sha = sha256( file_sha256 · provider · model · prompt_version · preproc_version
--                     [ · request_sha ] )
--   request_sha (optional) = sha256 of the ACTUAL provider request (prompt text +
--   gen-config + document-type). Binds response-affecting params the coarse
--   prompt_version constant does not track, so different prompts on identical
--   bytes never collapse onto one cached/in-flight result.
-- Invariant: identical input BYTES + identical pipeline ⇒ identical OCR result,
-- regardless of WHO uploaded → safe to share the cached value across requests
-- (no cross-user leak: the value is a pure function of the content + pipeline).
--
-- VALUE = the OCR/AI result, which contains applicant PII (names/DOB/doc numbers).
-- It is stored ENCRYPTED AT REST (AES-256-GCM, same crypto as wizard_drafts —
-- apps/web/src/lib/v1/wizardDraftCrypto.ts). Columns hold ciphertext only; the
-- cleartext result is NEVER persisted and NEVER logged. Service-role only (RLS).
--
-- Additive + feature-flagged (OCR_CACHE_MODE, default off): creating this table
-- changes no current behavior.

create table if not exists public.ocr_cache (
  key_sha     text primary key,             -- sha256 of the content-addressed key (no PII)
  iv          text not null,                -- AES-GCM iv (hex)
  ciphertext  text not null,                -- encrypted OCR result (hex) — never plaintext
  tag         text not null,                -- AES-GCM auth tag (hex)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null          -- TTL; cron/cleanup deletes expired rows
);

create index if not exists idx_ocr_cache_expires_at on public.ocr_cache (expires_at);

alter table public.ocr_cache enable row level security;

-- No anon/authenticated policies: access is service-role only (RLS denies the rest).
-- Server OCR paths use the service-role client; the browser never reads this table.

comment on table public.ocr_cache is
  'Content-addressed OCR/AI result cache. key_sha = sha256(file_sha256·provider·model·prompt_version·preproc_version), no PII in key. Value is AES-256-GCM ciphertext (never plaintext PII), service-role only, TTL via expires_at. Identical bytes+pipeline ⇒ identical result ⇒ safe to share across users.';
