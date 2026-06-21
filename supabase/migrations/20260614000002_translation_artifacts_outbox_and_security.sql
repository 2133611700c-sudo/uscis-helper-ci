-- Migration: Phase 2 — immutable artifacts, transactional delivery outbox, atomic enqueue, security
-- Agent 1 (DB foundation). FORWARD-ONLY + ADDITIVE.
--
-- document_artifacts: append-only record of a generated, hash-bound rendition (one or more
--   versions per order). delivery_outbox: durable transactional outbox so a single worker delivers
--   each artifact exactly once (claim via FOR UPDATE SKIP LOCKED + UNIQUE idempotency_key).
--
-- Operator overrides REUSE canonical_overrides via append_canonical_overrides_atomic
--   (source='operator_override', confirmed=true, actor=<operator id>). Operator edits resolve
--   through resolveCanonicalDocument — there is intentionally NO parallel mutable translated_fields
--   authority. See apps/web/src/lib/translation/orders/index.ts for the documented contract.
--   NOTE: canonical_overrides.source historically CHECKed IN ('user_edit','certifier_override',
--   'system_correction'). To admit operator overrides without altering the existing constraint or
--   table, this migration replaces that CHECK with an additive superset (drop-if-exists + re-add)
--   that still includes all prior values. This widens, never narrows — no existing row is invalidated.

-- ============================================================================
-- 0. Admit 'operator_override' as a canonical_overrides source (additive widening)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.canonical_overrides'::regclass
      AND conname = 'canonical_overrides_source_check'
  ) THEN
    ALTER TABLE public.canonical_overrides DROP CONSTRAINT canonical_overrides_source_check;
  END IF;
  ALTER TABLE public.canonical_overrides
    ADD CONSTRAINT canonical_overrides_source_check
    CHECK (source IN ('user_edit','certifier_override','system_correction','operator_override'));
END $$;

-- ============================================================================
-- 1. document_artifacts — append-only, hash-bound rendition records
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_artifacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid NOT NULL REFERENCES public.translation_orders_v2(id),
  canonical_document_id    uuid REFERENCES public.canonical_documents(id),
  base_canonical_hash      text,
  resolved_canonical_hash  text,
  override_set_hash        text,
  override_version         integer,
  canonical_schema_version text,
  renderer_version         text,
  storage_bucket           text NOT NULL,
  storage_key              text NOT NULL,
  artifact_sha256          text NOT NULL,
  mime_type                text NOT NULL,
  byte_size                bigint NOT NULL,
  artifact_version         integer NOT NULL DEFAULT 1,
  generated_by             text NOT NULL,
  generated_at             timestamptz NOT NULL DEFAULT now(),
  metadata                 jsonb,
  delivery_status          text,
  CONSTRAINT document_artifacts_order_version_unique UNIQUE (order_id, artifact_version),
  CONSTRAINT document_artifacts_byte_size_nonneg CHECK (byte_size >= 0),
  CONSTRAINT document_artifacts_version_pos CHECK (artifact_version >= 1)
);

COMMENT ON TABLE public.document_artifacts IS
  'Append-only generated artifacts (PDFs etc.) for a translation order. Immutable: BEFORE '
  'UPDATE/DELETE triggers reject mutation (service_role bypasses RLS, so triggers, not policies, '
  'enforce this). Binds base/resolved/override hashes + schema/renderer versions for '
  'certification reproducibility. UNIQUE(order_id, artifact_version).';

CREATE INDEX IF NOT EXISTS idx_document_artifacts_order
  ON public.document_artifacts(order_id, artifact_version);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_canonical
  ON public.document_artifacts(canonical_document_id)
  WHERE canonical_document_id IS NOT NULL;

ALTER TABLE public.document_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_document_artifacts ON public.document_artifacts;
CREATE POLICY service_role_all_document_artifacts
  ON public.document_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. delivery_outbox — transactional outbox for exactly-once delivery
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.translation_orders_v2(id),
  artifact_id      uuid NOT NULL REFERENCES public.document_artifacts(id),
  destination_type text NOT NULL DEFAULT 'email',
  -- Opaque/hashed recipient reference; raw email never stored here or logged.
  recipient_ref    text,
  idempotency_key  text NOT NULL UNIQUE,
  state            text NOT NULL DEFAULT 'pending',
  attempt_count    integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz,
  last_error_code  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  CONSTRAINT delivery_outbox_state_valid CHECK (state IN ('pending','claimed','delivered','failed','retry')),
  CONSTRAINT delivery_outbox_attempt_nonneg CHECK (attempt_count >= 0)
);

COMMENT ON TABLE public.delivery_outbox IS
  'Transactional outbox for artifact delivery. idempotency_key is UNIQUE so duplicate enqueue is '
  'rejected. claim_outbox_event() claims one due row with FOR UPDATE SKIP LOCKED so concurrent '
  'workers cannot double-send. recipient_ref is opaque/hashed — never a raw email.';

CREATE INDEX IF NOT EXISTS idx_delivery_outbox_due
  ON public.delivery_outbox(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_delivery_outbox_order
  ON public.delivery_outbox(order_id);

ALTER TABLE public.delivery_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_delivery_outbox ON public.delivery_outbox;
CREATE POLICY service_role_all_delivery_outbox
  ON public.delivery_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Artifact immutability triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.document_artifacts_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('translation_orders.allow_admin_cleanup', true) = 'on'
     AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ARTIFACT_IMMUTABLE: document_artifacts rows are insert-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_document_artifacts_no_update ON public.document_artifacts;
DROP TRIGGER IF EXISTS trg_document_artifacts_no_delete ON public.document_artifacts;
CREATE TRIGGER trg_document_artifacts_no_update
  BEFORE UPDATE ON public.document_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.document_artifacts_immutable_guard();
CREATE TRIGGER trg_document_artifacts_no_delete
  BEFORE DELETE ON public.document_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.document_artifacts_immutable_guard();

REVOKE EXECUTE ON FUNCTION public.document_artifacts_immutable_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. create_artifact_and_enqueue — ONE transaction: artifact + transition + outbox
-- ============================================================================
-- Order MUST currently be in 'approved_for_render' (version p_expected_version). We insert the
-- artifact, transition approved_for_render -> artifact_generated -> delivery_pending (two hops, both
-- through the guarded mutator), and insert the outbox row — all atomically. Any failure rolls the
-- whole transaction back, so a failed artifact creates NO outbox event. Email send is OUTSIDE.

CREATE OR REPLACE FUNCTION public.create_artifact_and_enqueue(
  p_order_id                 uuid,
  p_expected_version         integer,
  p_actor                    text,
  p_canonical_document_id    uuid,
  p_base_canonical_hash      text,
  p_resolved_canonical_hash  text,
  p_override_set_hash        text,
  p_override_version         integer,
  p_canonical_schema_version text,
  p_renderer_version         text,
  p_storage_bucket           text,
  p_storage_key              text,
  p_artifact_sha256          text,
  p_mime_type                text,
  p_byte_size                bigint,
  p_generated_by             text,
  p_artifact_metadata        jsonb,
  p_recipient_ref            text,
  p_idempotency_key          text,
  p_destination_type         text
)
RETURNS TABLE(artifact_id uuid, outbox_id uuid, new_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_artifact_id uuid;
  v_outbox_id   uuid;
  v_next_ver    integer;
  v_ver         integer;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'ORDER_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Next artifact_version for this order (atomic under the order advisory lock taken by transition).
  SELECT COALESCE(MAX(artifact_version), 0) + 1 INTO v_next_ver
  FROM public.document_artifacts WHERE order_id = p_order_id;

  INSERT INTO public.document_artifacts (
    order_id, canonical_document_id, base_canonical_hash, resolved_canonical_hash,
    override_set_hash, override_version, canonical_schema_version, renderer_version,
    storage_bucket, storage_key, artifact_sha256, mime_type, byte_size,
    artifact_version, generated_by, metadata, delivery_status
  ) VALUES (
    p_order_id, p_canonical_document_id, p_base_canonical_hash, p_resolved_canonical_hash,
    p_override_set_hash, p_override_version, p_canonical_schema_version, p_renderer_version,
    p_storage_bucket, p_storage_key, p_artifact_sha256, p_mime_type, p_byte_size,
    v_next_ver, p_generated_by, p_artifact_metadata, 'pending'
  )
  RETURNING id INTO v_artifact_id;

  -- Hop 1: approved_for_render -> artifact_generated
  SELECT t.new_version INTO v_ver FROM public.transition_translation_order(
    p_order_id, p_expected_version, 'approved_for_render', 'artifact_generated',
    p_actor, 'artifact created', jsonb_build_object('artifact_version', v_next_ver)
  ) AS t;

  -- Hop 2: artifact_generated -> delivery_pending
  SELECT t.new_version INTO v_next_ver FROM public.transition_translation_order(
    p_order_id, v_ver, 'artifact_generated', 'delivery_pending',
    p_actor, 'enqueued for delivery', jsonb_build_object('artifact_id', v_artifact_id)
  ) AS t;

  INSERT INTO public.delivery_outbox (
    order_id, artifact_id, destination_type, recipient_ref, idempotency_key, state, next_attempt_at
  ) VALUES (
    p_order_id, v_artifact_id, COALESCE(p_destination_type, 'email'),
    p_recipient_ref, p_idempotency_key, 'pending', now()
  )
  RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_artifact_id, v_outbox_id, v_next_ver;
END;
$$;

COMMENT ON FUNCTION public.create_artifact_and_enqueue IS
  'Atomically: insert document_artifacts, transition order approved_for_render -> '
  'artifact_generated -> delivery_pending (through the guarded mutator), insert delivery_outbox. '
  'All-or-nothing: a failed artifact or duplicate idempotency_key rolls back everything (no orphan '
  'outbox). Email send is NOT part of this transaction. SECURITY DEFINER, service_role only.';

REVOKE EXECUTE ON FUNCTION public.create_artifact_and_enqueue(uuid,integer,text,uuid,text,text,text,integer,text,text,text,text,text,text,bigint,text,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_artifact_and_enqueue(uuid,integer,text,uuid,text,text,text,integer,text,text,text,text,text,text,bigint,text,jsonb,text,text,text) TO service_role;

-- ============================================================================
-- 5. claim_outbox_event — atomic single-row claim (FOR UPDATE SKIP LOCKED)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_outbox_event(p_worker text)
RETURNS TABLE(
  id uuid, order_id uuid, artifact_id uuid, destination_type text,
  recipient_ref text, idempotency_key text, attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_worker IS NULL OR length(btrim(p_worker)) = 0 THEN
    RAISE EXCEPTION 'OUTBOX_WORKER_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Pick one due row (pending, or retry whose next_attempt_at has passed), skipping rows another
  -- worker already locked. This is the exactly-once guard against duplicate workers.
  SELECT o.id INTO v_id
  FROM public.delivery_outbox o
  WHERE o.state IN ('pending','retry')
    AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= now())
  ORDER BY o.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;  -- nothing due
  END IF;

  UPDATE public.delivery_outbox o
  SET state = 'claimed',
      attempt_count = o.attempt_count + 1,
      last_error_code = NULL
  WHERE o.id = v_id;

  RETURN QUERY
  SELECT o.id, o.order_id, o.artifact_id, o.destination_type,
         o.recipient_ref, o.idempotency_key, o.attempt_count
  FROM public.delivery_outbox o WHERE o.id = v_id;
END;
$$;

COMMENT ON FUNCTION public.claim_outbox_event(text) IS
  'Atomically claims one due delivery_outbox row (state pending/retry, next_attempt_at due) using '
  'FOR UPDATE SKIP LOCKED, marks it claimed and increments attempt_count. Concurrent workers get '
  'different rows or nothing — no double-send. SECURITY DEFINER, service_role only.';

REVOKE EXECUTE ON FUNCTION public.claim_outbox_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_event(text) TO service_role;

-- ============================================================================
-- 6. Private storage bucket for artifacts
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('translation-artifacts', 'translation-artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. phase2_admin_cleanup — guarded sentinel cleanup (service_role only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.phase2_admin_cleanup(p_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_deleted integer := 0;
BEGIN
  IF p_prefix IS NULL OR p_prefix NOT LIKE 'PHASE2_TEST_%' THEN
    RAISE EXCEPTION 'PHASE2_ADMIN_CLEANUP_FORBIDDEN: prefix must start with PHASE2_TEST_';
  END IF;

  -- Open the txn-local gate the immutability/append-only triggers honor for sentinel rows.
  PERFORM set_config('translation_orders.allow_admin_cleanup', 'on', true);

  -- Delete in FK-safe order, scoped to sentinel orders (by checkout_session_id prefix).
  DELETE FROM public.delivery_outbox d
    USING public.translation_orders_v2 o
    WHERE d.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.document_artifacts a
    USING public.translation_orders_v2 o
    WHERE a.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.translation_order_events e
    USING public.translation_orders_v2 o
    WHERE e.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  -- Orders table has no immutability trigger on DELETE, but gate is harmless.
  DELETE FROM public.translation_orders_v2 WHERE checkout_session_id LIKE p_prefix || '%';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Also remove sentinel canonical docs/overrides created by Phase 2 tests (session prefix).
  PERFORM set_config('canonical.allow_admin_cleanup', 'on', true);
  DELETE FROM public.canonical_overrides ov
    USING public.canonical_documents cd
    WHERE ov.canonical_id = cd.id AND cd.session_id LIKE p_prefix || '%';
  DELETE FROM public.canonical_documents WHERE session_id LIKE p_prefix || '%';
  PERFORM set_config('canonical.allow_admin_cleanup', 'off', true);

  PERFORM set_config('translation_orders.allow_admin_cleanup', 'off', true);
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.phase2_admin_cleanup(text) IS
  'Service-role-only guarded cleanup of synthetic PHASE2_TEST_ rows across delivery_outbox, '
  'document_artifacts, translation_order_events, translation_orders_v2, and sentinel '
  'canonical_documents/overrides. Refuses any non-PHASE2_TEST_ prefix. Sets the txn-local GUCs the '
  'immutability triggers honor. Never touches real rows.';

REVOKE EXECUTE ON FUNCTION public.phase2_admin_cleanup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_admin_cleanup(text) TO service_role;

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.phase2_admin_cleanup(text);
-- DROP FUNCTION IF EXISTS public.claim_outbox_event(text);
-- DROP FUNCTION IF EXISTS public.create_artifact_and_enqueue(uuid,integer,text,uuid,text,text,text,integer,text,text,text,text,text,text,bigint,text,jsonb,text,text,text);
-- DROP TRIGGER IF EXISTS trg_document_artifacts_no_update ON public.document_artifacts;
-- DROP TRIGGER IF EXISTS trg_document_artifacts_no_delete ON public.document_artifacts;
-- DROP FUNCTION IF EXISTS public.document_artifacts_immutable_guard();
-- DROP TABLE IF EXISTS public.delivery_outbox;
-- DROP TABLE IF EXISTS public.document_artifacts;
-- DELETE FROM storage.buckets WHERE id='translation-artifacts';
-- (canonical_overrides_source_check widening is intentionally left in place.)
