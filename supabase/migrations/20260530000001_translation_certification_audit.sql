-- Internal 8 CFR §103.2(b)(3) attestation audit trail for translation orders.
-- Written by /api/translation/generate-pdf after the review gate passes.
-- (Applied to prod via MCP on 2026-05-30; this file tracks it in the repo.)
create table if not exists public.translation_certification_audit (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_id text,
  locale text,
  document_type text,
  certifier_name_present boolean not null default false,
  certifier_address_present boolean not null default false,
  signature_present boolean not null default false,
  signature_method text,
  data_reviewed boolean not null default false,
  accuracy_attested boolean not null default false,
  review_confirmed boolean not null default false,
  document_hash text not null,
  certification_version text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  audit_payload jsonb not null
);
comment on table public.translation_certification_audit is
  'Internal 8 CFR 103.2(b)(3) attestation audit trail for translation orders. Service-role only.';
alter table public.translation_certification_audit enable row level security;
