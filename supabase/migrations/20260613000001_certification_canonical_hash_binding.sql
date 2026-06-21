-- Certification canonical hash binding (CERTIFICATION_REPRODUCIBILITY_CONTRACT).
--
-- Adds 7 columns to translation_certification_audit for reproducibility proof:
--   canonical_document_id  FK to canonical_documents.id (which canonical was used)
--   base_canonical_hash    fields_hash of the canonical_documents row before overrides
--   resolved_canonical_hash SHA-256(base_fields_hash + ordered confirmed overrides)
--   override_set_hash      SHA-256(confirmed overrides only, independent of base)
--   override_version       MAX version of applied overrides (0 if none)
--   canonical_schema_version semantic version of CanonicalField type schema (e.g. '1.0.0')
--   renderer_version       version of the translation renderer
--
-- All columns are nullable to avoid breaking existing rows.
-- DO NOT APPLY this migration without owner approval.
-- The canonical_documents table must exist before applying this migration
-- (created by a separate migration from the canonical continuity feature).

alter table public.translation_certification_audit
  add column if not exists canonical_document_id uuid null,
  add column if not exists base_canonical_hash text null,
  add column if not exists resolved_canonical_hash text null,
  add column if not exists override_set_hash text null,
  add column if not exists override_version integer null,
  add column if not exists canonical_schema_version text null,
  add column if not exists renderer_version text null;

comment on column public.translation_certification_audit.canonical_document_id is
  'FK to canonical_documents.id — which canonical base was used for this certified translation.';
comment on column public.translation_certification_audit.base_canonical_hash is
  'fields_hash of canonical_documents row (proves base state before any overrides).';
comment on column public.translation_certification_audit.resolved_canonical_hash is
  'SHA-256(base_fields_hash + ordered confirmed override set). Reproducibility proof.';
comment on column public.translation_certification_audit.override_set_hash is
  'SHA-256 of confirmed overrides only, independent of base. Auditable correction set.';
comment on column public.translation_certification_audit.override_version is
  'MAX version of applied confirmed overrides (0 if none applied).';
comment on column public.translation_certification_audit.canonical_schema_version is
  'Semantic version of the CanonicalField type schema at time of certification.';
comment on column public.translation_certification_audit.renderer_version is
  'Version of the translation renderer at time of certification. Together with base+overrides, proves reproducibility.';
