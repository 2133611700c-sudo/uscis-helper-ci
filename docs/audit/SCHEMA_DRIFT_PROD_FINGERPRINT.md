# Production Schema Fingerprint — V2 Translation-Operator Tables

> Read-only MCP introspection of live prod (`rtfxrlountkoegsseukx`, Postgres 17.6) captured
> 2026-06-14. PII-FREE: schema metadata only (table/column/constraint/index/policy/function
> definitions). No row data, no emails, no payloads.
>
> Purpose: the production fingerprint against which the reconciled migrations in
> `supabase/migrations/2026061400000{1..4}_*.sql` are proven equivalent (diff = 0).

## Scope — 5 drifted tables (exist in prod, not created by any migration in `main` before this PR)
`translation_orders_v2`, `translation_order_events`, `document_artifacts`, `delivery_outbox`,
`stripe_processed_events`.

---

## 1. `translation_orders_v2` (16 columns)
| # | column | type | null | default |
|---|--------|------|------|---------|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | checkout_session_id | text | NO | — |
| 3 | canonical_document_id | uuid | YES | — |
| 4 | product | text | NO | — |
| 5 | verified_recipient_email | text | YES | — |
| 6 | document_type | text | YES | — |
| 7 | source_language | text | YES | — |
| 8 | locale | text | YES | — |
| 9 | status | text | NO | 'queued' |
| 10 | version | integer | NO | 0 |
| 11 | legacy | boolean | NO | false |
| 12 | created_at | timestamptz | NO | now() |
| 13 | updated_at | timestamptz | NO | now() |
| 14 | paid_at | timestamptz | YES | — |
| 15 | completed_at | timestamptz | YES | — |
| 16 | expires_at | timestamptz | YES | — |

Constraints: `translation_orders_v2_pkey PRIMARY KEY (id)`;
`translation_orders_v2_checkout_session_id_key UNIQUE (checkout_session_id)`;
`translation_orders_v2_product_check CHECK (product = 'translation')`;
`translation_orders_v2_status_valid CHECK (status IN (queued, assigned, in_review,
needs_user_clarification, approved_for_render, artifact_generated, delivery_pending, delivered,
delivery_failed, cancelled))`; `translation_orders_v2_version_nonneg CHECK (version >= 0)`;
FK `canonical_document_id -> canonical_documents(id)`.
Indexes: pkey; `translation_orders_v2_checkout_session_id_key` (UNIQUE); `uq_translation_orders_v2_checkout`
(UNIQUE on checkout_session_id); `idx_translation_orders_v2_canonical` (partial, canonical_document_id IS NOT NULL);
`idx_translation_orders_v2_status`.
RLS: **enabled**. Policy `service_role_all_translation_orders_v2` ALL → service_role using=true check=true.
Trigger: `trg_translation_orders_v2_update_guard` BEFORE UPDATE → `translation_orders_v2_update_guard()`.

## 2. `translation_order_events` (9 columns)
id uuid PK; order_id uuid NOT NULL FK→translation_orders_v2(id); from_status text; to_status text NOT NULL;
version integer NOT NULL; actor text NOT NULL; reason text; metadata jsonb; created_at timestamptz NOT NULL now().
Index `idx_translation_order_events_order (order_id, version)`. RLS enabled, policy
`service_role_all_translation_order_events`. Triggers `trg_translation_order_events_no_update` (BEFORE UPDATE),
`trg_translation_order_events_no_delete` (BEFORE DELETE) → `translation_order_events_append_only_guard()`.

## 3. `document_artifacts` (19 columns)
id uuid PK; order_id uuid NOT NULL FK→translation_orders_v2(id); canonical_document_id uuid FK→canonical_documents(id);
base_canonical_hash, resolved_canonical_hash, override_set_hash text; override_version int; canonical_schema_version,
renderer_version text; storage_bucket text NOT NULL; storage_key text NOT NULL; artifact_sha256 text NOT NULL;
mime_type text NOT NULL; byte_size bigint NOT NULL; artifact_version int NOT NULL DEFAULT 1; generated_by text NOT NULL;
generated_at timestamptz NOT NULL now(); metadata jsonb; delivery_status text.
Constraints: pkey; `document_artifacts_order_version_unique UNIQUE (order_id, artifact_version)`;
`document_artifacts_byte_size_nonneg CHECK (byte_size >= 0)`; `document_artifacts_version_pos CHECK (artifact_version >= 1)`.
Indexes: pkey; order_version_unique; `idx_document_artifacts_order (order_id, artifact_version)`;
`idx_document_artifacts_canonical` (partial). RLS enabled, policy `service_role_all_document_artifacts`.
Triggers `trg_document_artifacts_no_update`/`_no_delete` → `document_artifacts_immutable_guard()`.

## 4. `delivery_outbox` (12 columns)
id uuid PK; order_id uuid NOT NULL FK→translation_orders_v2(id); artifact_id uuid NOT NULL FK→document_artifacts(id);
destination_type text NOT NULL DEFAULT 'email'; recipient_ref text; idempotency_key text NOT NULL UNIQUE;
state text NOT NULL DEFAULT 'pending'; attempt_count int NOT NULL DEFAULT 0; next_attempt_at timestamptz;
last_error_code text; created_at timestamptz NOT NULL now(); delivered_at timestamptz.
Constraints: pkey; `delivery_outbox_idempotency_key_key UNIQUE (idempotency_key)`;
`delivery_outbox_state_valid CHECK (state IN (pending, claimed, delivered, failed, retry))`;
`delivery_outbox_attempt_nonneg CHECK (attempt_count >= 0)`.
Indexes: pkey; idempotency_key_key (UNIQUE); `idx_delivery_outbox_due (state, next_attempt_at)`;
`idx_delivery_outbox_order (order_id)`. RLS enabled, policy `service_role_all_delivery_outbox`. No triggers.

## 5. `stripe_processed_events` (6 columns)
stripe_event_id text **PRIMARY KEY**; event_type text NOT NULL; checkout_session_id text;
order_id uuid FK→translation_orders_v2(id); result_code text; processed_at timestamptz NOT NULL now().
Index `idx_stripe_processed_events_checkout` (partial, checkout_session_id IS NOT NULL).
RLS enabled, policy `service_role_all_stripe_processed_events`. Triggers
`trg_stripe_processed_events_no_update`/`_no_delete` → `stripe_processed_events_append_only_guard()`.

---

## Functions (12 — all `public`, SECURITY DEFINER except where noted)
| function | identity args | secdef | lang |
|----------|---------------|--------|------|
| transition_translation_order | (uuid, integer, text, text, text, text, jsonb) | yes | plpgsql |
| create_artifact_and_enqueue | (uuid, integer, text, uuid, text, text, text, integer, text, text, text, text, text, text, bigint, text, jsonb, text, text, text) | yes | plpgsql |
| claim_outbox_event | (text) | yes | plpgsql |
| record_stripe_processed_event | (text, text, text, uuid, text) | yes | plpgsql |
| phase2_admin_cleanup | (text) | yes | plpgsql |
| translation_order_transition_allowed | (text, text) | **no** | sql (IMMUTABLE) |
| translation_orders_v2_update_guard | () | yes | plpgsql |
| translation_order_events_append_only_guard | () | yes | plpgsql |
| document_artifacts_immutable_guard | () | yes | plpgsql |
| stripe_processed_events_append_only_guard | () | yes | plpgsql |
| canonical_documents_immutable_guard | () | yes | plpgsql |
| canonical_overrides_append_only_guard | () | yes | plpgsql |

## Triggers (7)
`trg_translation_orders_v2_update_guard` (BEFORE UPDATE on translation_orders_v2);
`trg_translation_order_events_no_update`, `trg_translation_order_events_no_delete`;
`trg_document_artifacts_no_update`, `trg_document_artifacts_no_delete`;
`trg_stripe_processed_events_no_update`, `trg_stripe_processed_events_no_delete`.

## Cross-table additive widenings (from migrations 000002 & 000003)
- `canonical_overrides_source_check` = `CHECK (source IN ('user_edit','certifier_override','system_correction','operator_override'))`
  — widened superset including `operator_override` (migration 000002).
- `canonical_documents_immutable_guard()` and `canonical_overrides_append_only_guard()` bodies both
  contain `PHASE2_TEST_` — widened to honor PHASE2_TEST_ sentinel cleanup (migration 000003). Verified live.
- Storage bucket `translation-artifacts` exists, `public = false` (migration 000002).

## Migration ledger (`supabase_migrations.schema_migrations`) — V2 rows
| ledger version (MCP-generated) | name |
|---|---|
| 20260614005529 | translation_orders_v2_and_state_machine |
| 20260614005615 | translation_artifacts_outbox_and_security |
| 20260614005650 | widen_canonical_guards_for_phase2_sentinel |
| 20260614032529 | stripe_processed_events |

These ledger versions DIFFER from the local file prefixes `20260614000001..000004` → naming drift
(see `SCHEMA_DRIFT_RECONCILIATION.md`).
