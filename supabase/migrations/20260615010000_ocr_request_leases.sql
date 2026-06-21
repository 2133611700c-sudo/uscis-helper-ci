-- ocr_request_leases — DISTRIBUTED single-flight for OCR/AI provider calls (PR B).
--
-- WHY: in-flight dedup (a per-process Map) cannot collapse a concurrent burst on
-- serverless — Vercel fans requests across lambda instances. A persistent cache
-- ALONE is also insufficient: five simultaneous cache-misses would each call the
-- provider before any of them writes the result. This table is the cross-instance
-- LEASE so exactly ONE caller (the winner) calls the provider per content key; the
-- others (losers) wait briefly and read the winner's cached result — no provider
-- call. Winner-failure releases the lease with a negative cooldown so losers get a
-- structured "unavailable" instead of a retry storm.
--
-- KEY = sha256 of the content-addressed OCR key (file_sha256·provider·model·
-- prompt_version·preproc_version·request_sha). NO PII, NO filenames, NO OCR text,
-- NO document values, NO user/session id — coordination metadata ONLY.
--
-- Additive + behind a runtime flag (OCR_DISTRIBUTED_DEDUP_MODE, default off):
-- creating this table changes no current behaviour.

create table if not exists public.ocr_request_leases (
  cache_key_hash       text primary key,            -- sha256 of content-addressed key (no PII)
  status               text not null default 'in_flight'
                         check (status in ('in_flight', 'done', 'failed')),
  lease_owner          text not null,               -- opaque per-attempt owner token (no PII)
  lease_expires_at     timestamptz not null,        -- TTL; past now() ⇒ stealable (stale recovery)
  provider             text not null,               -- technical dimension only
  model_version        text not null,               -- technical dimension only
  pipeline_version     text not null,               -- technical dimension only
  -- Negative cooldown after a provider failure (so losers don't retry-storm). NO
  -- error payload, NO PII — just a class + a "do not hammer until" time.
  rate_limited_until   timestamptz,
  error_class          text,                        -- e.g. 'OCR_RATE_LIMITED' (label only)
  retry_after_seconds  integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_ocr_request_leases_expires
  on public.ocr_request_leases (lease_expires_at);

alter table public.ocr_request_leases enable row level security;
-- No anon/authenticated policies: service-role only (RLS denies the rest). The
-- browser NEVER touches this table.

comment on table public.ocr_request_leases is
  'Cross-instance distributed single-flight lease for paid OCR/AI calls. PK = sha256 of the content-addressed OCR key (no PII). Exactly one winner per key calls the provider; losers wait and read the cached result. Service-role only (RLS). TTL via lease_expires_at enables stale/crash recovery.';

-- ── acquire_ocr_lease ─────────────────────────────────────────────────────────
-- Atomic winner election. Returns one row:
--   acquired (bool)       — true ⇒ caller is the winner and MUST do the single call
--   status (text)         — current lease status after the attempt
--   rate_limited_until    — set when a prior attempt failed (negative cooldown)
--   error_class           — label of the prior failure, if any
--   retry_after_seconds   — provider Retry-After hint, if any
-- A lease is STEALABLE when it is past its TTL (crash/stale recovery) — an expired
-- 'in_flight' row is taken over by the next caller. A 'done'/'failed' row is NOT
-- re-acquired here (the caller reads the cache / honours the cooldown).
create or replace function public.acquire_ocr_lease(
  p_cache_key_hash    text,
  p_owner             text,
  p_ttl_seconds       integer,
  p_provider          text,
  p_model_version     text,
  p_pipeline_version  text
)
returns table (
  acquired             boolean,
  status               text,
  rate_limited_until   timestamptz,
  error_class          text,
  retry_after_seconds  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_expires    timestamptz := now() + make_interval(secs => greatest(p_ttl_seconds, 1));
  v_row        public.ocr_request_leases%rowtype;
begin
  -- Serialize racing acquirers on this key so the winner election is atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_cache_key_hash, 0));

  select * into v_row from public.ocr_request_leases where cache_key_hash = p_cache_key_hash;

  if not found then
    insert into public.ocr_request_leases (
      cache_key_hash, status, lease_owner, lease_expires_at,
      provider, model_version, pipeline_version, created_at, updated_at
    ) values (
      p_cache_key_hash, 'in_flight', p_owner, v_expires,
      p_provider, p_model_version, p_pipeline_version, v_now, v_now
    );
    return query select true, 'in_flight'::text, null::timestamptz, null::text, null::integer;
    return;
  end if;

  -- An expired in_flight lease (crashed/stale winner) is stealable.
  if v_row.status = 'in_flight' and v_row.lease_expires_at < v_now then
    update public.ocr_request_leases
      set lease_owner = p_owner, lease_expires_at = v_expires, updated_at = v_now,
          provider = p_provider, model_version = p_model_version, pipeline_version = p_pipeline_version
      where cache_key_hash = p_cache_key_hash;
    return query select true, 'in_flight'::text, null::timestamptz, null::text, null::integer;
    return;
  end if;

  -- Active winner, completed, or cooling down: caller does NOT acquire. Surface the
  -- status + any cooldown so the caller can wait (in_flight), read cache (done), or
  -- back off (failed/cooldown) — never call the provider.
  return query select false, v_row.status, v_row.rate_limited_until, v_row.error_class, v_row.retry_after_seconds;
end;
$$;

comment on function public.acquire_ocr_lease(text, text, integer, text, text, text) is
  'Atomic distributed single-flight winner election keyed on the content-addressed OCR key hash. '
  'advisory-xact-locked. Inserts a fresh in_flight lease (acquired=true) or steals an EXPIRED in_flight lease '
  '(crash/stale recovery, acquired=true); otherwise acquired=false with the current status + negative-cooldown fields. '
  'SECURITY DEFINER + search_path=public. service_role only.';

-- ── complete_ocr_lease ────────────────────────────────────────────────────────
-- Winner marks the lease done AFTER writing the encrypted cache. Owner-checked:
-- only the current lease_owner may complete (a stolen/expired lease cannot).
create or replace function public.complete_ocr_lease(
  p_cache_key_hash text,
  p_owner          text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.ocr_request_leases
    set status = 'done', updated_at = now(),
        rate_limited_until = null, error_class = null, retry_after_seconds = null
    where cache_key_hash = p_cache_key_hash
      and lease_owner = p_owner
      and status = 'in_flight';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.complete_ocr_lease(text, text) is
  'Winner marks its in_flight lease done (after writing the cache). Owner-checked. service_role only.';

-- ── fail_ocr_lease ────────────────────────────────────────────────────────────
-- Winner marks the lease failed (provider 429/5xx/timeout). Sets a negative
-- cooldown so losers get a structured "unavailable" instead of a retry storm. NO
-- error payload / PII — only a class label + cooldown window.
create or replace function public.fail_ocr_lease(
  p_cache_key_hash      text,
  p_owner               text,
  p_error_class         text,
  p_retry_after_seconds integer,
  p_cooldown_seconds    integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.ocr_request_leases
    set status = 'failed', updated_at = now(),
        error_class = p_error_class,
        retry_after_seconds = p_retry_after_seconds,
        rate_limited_until = now() + make_interval(secs => greatest(coalesce(p_cooldown_seconds, 0), 0))
    where cache_key_hash = p_cache_key_hash
      and lease_owner = p_owner
      and status = 'in_flight';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.fail_ocr_lease(text, text, text, integer, integer) is
  'Winner marks its in_flight lease failed with a negative cooldown (rate_limited_until). No PII. service_role only.';

-- ── Harden: service-role only on all three functions ──────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.acquire_ocr_lease(text, text, integer, text, text, text)',
    'public.complete_ocr_lease(text, text)',
    'public.fail_ocr_lease(text, text, text, integer, integer)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
