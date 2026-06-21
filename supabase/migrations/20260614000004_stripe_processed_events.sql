-- Migration: Phase 2 — Stripe webhook processed-events dedupe ledger (webhook authority)
-- FORWARD-ONLY + ADDITIVE. Creates ONE new append-only table + a guarded record RPC. No existing
-- table/function/trigger is altered or dropped.
--
-- WHY: the signature-verified Stripe webhook becomes the AUTHORITY for translation_orders_v2
-- create/update. Stripe delivers at-least-once, so the same event id can arrive multiple times
-- (duplicate/replayed). This ledger gives the webhook a primary idempotency key on the Stripe
-- EVENT id (distinct from, and complementary to, the per-order idempotency on checkout_session_id).
-- A duplicate event id is a no-op: record_stripe_processed_event() returns inserted=false and the
-- handler skips re-processing (no second audit transition, no second outbox event).
--
-- PII: this table stores ONLY opaque/truncated Stripe ids (event id, optional checkout id), a
-- PII-free event type, an internal order_id (uuid), and a PII-free result code. NEVER an email,
-- name, amount tied to a person, or any raw Stripe payload.

-- ============================================================================
-- 1. stripe_processed_events — append-only webhook dedupe ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  -- The Stripe event id (evt_...) is globally unique and is the webhook idempotency key.
  stripe_event_id   text PRIMARY KEY,
  event_type        text NOT NULL,
  -- Opaque Stripe checkout session id (cs_...) when applicable; never a raw payload.
  checkout_session_id text,
  -- The V2 order this event resolved to (if any). Internal uuid, not PII.
  order_id          uuid REFERENCES public.translation_orders_v2(id),
  -- PII-free machine result code (e.g. 'order_created','order_reused','expired_noop').
  result_code       text,
  processed_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_processed_events IS
  'Append-only idempotency ledger for the signature-verified Stripe webhook. PRIMARY KEY on the '
  'Stripe event id makes duplicate/replayed events a no-op (the handler skips re-processing). '
  'Complements the per-order idempotency on translation_orders_v2.checkout_session_id. '
  'PII-free: opaque Stripe ids, event type, internal order uuid, result code only.';

CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_checkout
  ON public.stripe_processed_events(checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
-- Revoke the default broad table grants (service_role still bypasses RLS; triggers enforce
-- append-only regardless of role). No anon/authenticated access.
REVOKE ALL ON public.stripe_processed_events FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS service_role_all_stripe_processed_events ON public.stripe_processed_events;
CREATE POLICY service_role_all_stripe_processed_events
  ON public.stripe_processed_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Append-only guard — ledger rows are never UPDATEd/DELETEd (except sentinel cleanup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stripe_processed_events_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Guarded sentinel cleanup may DELETE PHASE2_TEST_ rows only.
  IF current_setting('translation_orders.allow_admin_cleanup', true) = 'on'
     AND TG_OP = 'DELETE'
     AND COALESCE(OLD.stripe_event_id, '') LIKE 'PHASE2_TEST_%' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'STRIPE_EVENTS_APPEND_ONLY: stripe_processed_events rows are append-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_processed_events_no_update ON public.stripe_processed_events;
DROP TRIGGER IF EXISTS trg_stripe_processed_events_no_delete ON public.stripe_processed_events;
CREATE TRIGGER trg_stripe_processed_events_no_update
  BEFORE UPDATE ON public.stripe_processed_events
  FOR EACH ROW EXECUTE FUNCTION public.stripe_processed_events_append_only_guard();
CREATE TRIGGER trg_stripe_processed_events_no_delete
  BEFORE DELETE ON public.stripe_processed_events
  FOR EACH ROW EXECUTE FUNCTION public.stripe_processed_events_append_only_guard();

REVOKE EXECUTE ON FUNCTION public.stripe_processed_events_append_only_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. record_stripe_processed_event — idempotent insert (returns whether it was new)
-- ============================================================================
-- INSERT ... ON CONFLICT DO NOTHING on the event id. inserted=true ⇒ this caller won the race and
-- should process the event; inserted=false ⇒ a duplicate (already recorded), skip re-processing.

CREATE OR REPLACE FUNCTION public.record_stripe_processed_event(
  p_stripe_event_id     text,
  p_event_type          text,
  p_checkout_session_id text,
  p_order_id            uuid,
  p_result_code         text
)
RETURNS TABLE(inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  IF p_stripe_event_id IS NULL OR length(btrim(p_stripe_event_id)) = 0 THEN
    RAISE EXCEPTION 'STRIPE_EVENT_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.stripe_processed_events
    (stripe_event_id, event_type, checkout_session_id, order_id, result_code)
  VALUES
    (p_stripe_event_id, p_event_type, p_checkout_session_id, p_order_id, p_result_code)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN QUERY SELECT (v_inserted)::boolean;
END;
$$;

COMMENT ON FUNCTION public.record_stripe_processed_event(text, text, text, uuid, text) IS
  'Idempotently record a processed Stripe webhook event. INSERT ON CONFLICT DO NOTHING on the '
  'event id; returns inserted=true when this caller is the FIRST to record it (process the event) '
  'or inserted=false on a duplicate (skip). SECURITY DEFINER, service_role only. PII-free.';

REVOKE EXECUTE ON FUNCTION public.record_stripe_processed_event(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_processed_event(text, text, text, uuid, text) TO service_role;

-- ============================================================================
-- 4. Extend phase2_admin_cleanup to also purge sentinel stripe_processed_events rows
-- ============================================================================
-- CREATE OR REPLACE only — additive. The sentinel rows the webhook tests create use a
-- 'PHASE2_TEST_' event-id prefix; they are removed in the same guarded cleanup.

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

  PERFORM set_config('translation_orders.allow_admin_cleanup', 'on', true);

  -- Sentinel processed-event ledger rows (by event-id prefix OR checkout-session prefix).
  DELETE FROM public.stripe_processed_events
    WHERE stripe_event_id LIKE p_prefix || '%'
       OR checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.delivery_outbox d
    USING public.translation_orders_v2 o
    WHERE d.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.document_artifacts a
    USING public.translation_orders_v2 o
    WHERE a.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.translation_order_events e
    USING public.translation_orders_v2 o
    WHERE e.order_id = o.id AND o.checkout_session_id LIKE p_prefix || '%';

  DELETE FROM public.translation_orders_v2 WHERE checkout_session_id LIKE p_prefix || '%';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

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

REVOKE EXECUTE ON FUNCTION public.phase2_admin_cleanup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_admin_cleanup(text) TO service_role;

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_stripe_processed_events_no_update ON public.stripe_processed_events;
-- DROP TRIGGER IF EXISTS trg_stripe_processed_events_no_delete ON public.stripe_processed_events;
-- DROP FUNCTION IF EXISTS public.record_stripe_processed_event(text,text,text,uuid,text);
-- DROP FUNCTION IF EXISTS public.stripe_processed_events_append_only_guard();
-- DROP TABLE IF EXISTS public.stripe_processed_events;
-- (phase2_admin_cleanup retains the additive sentinel-purge of stripe_processed_events.)
