-- L3 T0 — certifier_override_audit (append-only, ADR-021 invariants enforced at the DB).
-- REPO↔PROD SYNC: this file reproduces the FINAL prod state, reconstructed from the live
-- schema via pg_get_* introspection. It FOLDS the owner's three MCP-applied migrations:
--   l3_t0_certifier_override_audit_persistence (224523)
--   l3_t0_audit_harden_search_path_and_consolidate_policies (224604) — function search_path + 1 SELECT policy
--   l3_t0_audit_transitional_drop_certifier_fk (230414) — certifier_id is a SOFT uuid reference
-- (the 4-step history cannot be byte-replayed from introspection; the canonical source is the
-- Supabase migration history — run `supabase db pull` for CLI-exact files). Idempotent-ish.
-- T0 = hashes + ids only, NO PII values. certifier_id validated by the app against OWNER_CERTIFIER_ID.

create table if not exists public.certifier_override_audit (
  id                     uuid        primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  field_name             text        not null,
  doc_type               text,
  tier                   integer     not null,
  reason_code            text        not null,
  reason_note            text,
  certifier_id           uuid        not null,   -- SOFT reference (FK to profiles dropped, transitional)
  previous_value_sha256  text,
  new_value_sha256       text,
  session_id             uuid,
  linked_pdf_doc_id      uuid,
  cross_doc_anchor_id    uuid,
  immutable_signature    text        not null,
  constraint certifier_override_audit_tier_check check (tier = any (array[1, 2, 3])),
  constraint certifier_override_audit_reason_code_check check (reason_code = any (array[
    'source_verified','source_corroborated_user_value','user_clarified',
    'dual_witness','unreadable_per_source','other_with_text'])),
  constraint other_requires_note check (
    (reason_code <> 'other_with_text') or (reason_note is not null and length(trim(reason_note)) > 0)),
  constraint unreadable_means_refusal check (
    ((reason_code = 'unreadable_per_source') and (new_value_sha256 is null)) or
    ((reason_code <> 'unreadable_per_source') and (new_value_sha256 is not null))),
  constraint user_clarified_tier3_only check (
    not ((reason_code = 'user_clarified') and (tier = any (array[1, 2]))))
);

create index if not exists idx_certifier_audit_created_at on public.certifier_override_audit using btree (created_at desc);
create index if not exists idx_certifier_audit_certifier_created on public.certifier_override_audit using btree (certifier_id, created_at desc);
create index if not exists idx_certifier_audit_tier_reason on public.certifier_override_audit using btree (tier, reason_code, created_at desc);
create index if not exists idx_certifier_audit_session on public.certifier_override_audit using btree (session_id) where (session_id is not null);
create index if not exists idx_certifier_audit_pdf on public.certifier_override_audit using btree (linked_pdf_doc_id) where (linked_pdf_doc_id is not null);
create index if not exists idx_certifier_audit_cross_doc on public.certifier_override_audit using btree (cross_doc_anchor_id) where (cross_doc_anchor_id is not null);

-- Append-only: reject any UPDATE/DELETE (hardened search_path per migration 224604).
create or replace function public.reject_audit_modification()
  returns trigger
  language plpgsql
  set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception 'certifier_override_audit is append-only: % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists no_update_certifier_override_audit on public.certifier_override_audit;
create trigger no_update_certifier_override_audit before update on public.certifier_override_audit
  for each row execute function public.reject_audit_modification();
drop trigger if exists no_delete_certifier_override_audit on public.certifier_override_audit;
create trigger no_delete_certifier_override_audit before delete on public.certifier_override_audit
  for each row execute function public.reject_audit_modification();

alter table public.certifier_override_audit enable row level security;
-- Consolidated read policy (migration 224604): a certifier sees their own rows; an admin sees all.
drop policy if exists certifier_audit_read_admin_or_own on public.certifier_override_audit;
create policy certifier_audit_read_admin_or_own on public.certifier_override_audit
  for select to authenticated
  using (
    (certifier_id = (select auth.uid()))
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'admin')
  );

-- COMMENTs verbatim from prod (parity — closes the comment-only diff gap).
comment on table public.certifier_override_audit is
  'L3 T0 audit persistence: hash-based durable chain for certifier_override decisions. T0=hashes only (operational fraud-detection); T1 (raw values for legal subpoena) requires separate ADR-019 owner approval. Append-only by trigger.';
comment on column public.certifier_override_audit.certifier_id is
  'Soft reference to certifier identity (uuid). Owner-only transitional phase: validated by app layer against OWNER_CERTIFIER_ID env. Hard FK to certifiers table will be restored when ADR-021 delegated role lands.';
comment on column public.certifier_override_audit.tier is
  'Criticality tier from CRITICAL_FIELDS_CONTRACT: 1=applicant identity, 2=related/validity, 3=non-critical';
comment on column public.certifier_override_audit.cross_doc_anchor_id is
  'ADR-021 Q3: marks parent/spouse fields to enable future case-level anchor reconciliation without retrofit';
comment on column public.certifier_override_audit.immutable_signature is
  'sha256 of canonical row content; verifies record has not been tampered. Computed by app layer before insert.';
