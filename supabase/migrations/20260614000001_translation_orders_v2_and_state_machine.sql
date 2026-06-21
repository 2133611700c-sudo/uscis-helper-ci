-- Migration: Phase 2 Translation Operator Pipeline V2 — durable order entity + atomic state machine
-- Agent 1 (DB foundation). FORWARD-ONLY + ADDITIVE. Creates NEW tables/functions/triggers only.
--
-- NAMING NOTE (load-bearing): a legacy `public.translation_orders` table already EXISTS in the
-- live project (migration 20260507235900, 2 real rows, schema name/email/phone/plan/...). The
-- Phase 2 constraint forbids altering or dropping any existing table. The new V2 order entity is
-- therefore named `translation_orders_v2`. It is a distinct, canonical-bound order aggregate and
-- does NOT touch the legacy table. The TS module exposes it as the `orders` domain.
--
-- WHY a guarded BEFORE-UPDATE trigger (not just RLS): service_role BYPASSES RLS, and the table
-- owner (postgres) is never subject to RLS. Immutability/transition invariants must be enforced by
-- triggers that fire for EVERY role. We mirror the proven canonical pattern (a transaction-local
-- GUC set inside the SECURITY DEFINER RPC; the trigger refuses any status/version change not made
-- through the RPC).
--
-- PII: events/metadata are PII-free (keys/status/counts/actor only — never field values).

-- ============================================================================
-- 1. translation_orders_v2 — durable, canonical-bound order aggregate
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.translation_orders_v2 (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stripe checkout session is the capability + idempotency key. One order per checkout.
  checkout_session_id      text NOT NULL UNIQUE,
  -- Optional binding to the immutable canonical document this order renders from.
  canonical_document_id    uuid REFERENCES public.canonical_documents(id),
  product                  text NOT NULL CHECK (product = 'translation'),
  -- Email is authoritative ONLY from Stripe (verified server-side); never client-supplied.
  verified_recipient_email text,
  document_type            text,
  source_language          text,
  locale                   text,
  status                   text NOT NULL DEFAULT 'queued',
  version                  integer NOT NULL DEFAULT 0,
  -- Orders created without a canonical binding (legacy/manual path).
  legacy                   boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  paid_at                  timestamptz,
  completed_at             timestamptz,
  expires_at               timestamptz,
  CONSTRAINT translation_orders_v2_status_valid CHECK (status IN (
    'queued','assigned','in_review','needs_user_clarification','approved_for_render',
    'artifact_generated','delivery_pending','delivered','delivery_failed','cancelled'
  )),
  CONSTRAINT translation_orders_v2_version_nonneg CHECK (version >= 0)
);

COMMENT ON TABLE public.translation_orders_v2 IS
  'Phase 2 durable translation order aggregate. State changes ONLY through '
  'transition_translation_order() (a BEFORE UPDATE trigger blocks any status/version change made '
  'outside the RPC). checkout_session_id is UNIQUE (one order per Stripe checkout). '
  'verified_recipient_email is Stripe-authoritative only. Distinct from the legacy '
  'public.translation_orders table, which is untouched.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_translation_orders_v2_checkout
  ON public.translation_orders_v2(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_translation_orders_v2_canonical
  ON public.translation_orders_v2(canonical_document_id)
  WHERE canonical_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_translation_orders_v2_status
  ON public.translation_orders_v2(status);

ALTER TABLE public.translation_orders_v2 ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. service_role only (and it still passes the triggers).
DROP POLICY IF EXISTS service_role_all_translation_orders_v2 ON public.translation_orders_v2;
CREATE POLICY service_role_all_translation_orders_v2
  ON public.translation_orders_v2 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. translation_order_events — append-only audit log of every transition
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.translation_order_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.translation_orders_v2(id),
  from_status  text,
  to_status    text NOT NULL,
  version      integer NOT NULL,
  actor        text NOT NULL,
  reason       text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.translation_order_events IS
  'Append-only ledger of translation_orders_v2 state transitions. One row per successful '
  'transition, written inside transition_translation_order(). BEFORE UPDATE/DELETE triggers '
  'reject mutation. metadata is PII-free.';

CREATE INDEX IF NOT EXISTS idx_translation_order_events_order
  ON public.translation_order_events(order_id, version);

ALTER TABLE public.translation_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_translation_order_events ON public.translation_order_events;
CREATE POLICY service_role_all_translation_order_events
  ON public.translation_order_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Allowed-transition map (in-function) + the transition RPC
-- ============================================================================
-- Helper: is a transition allowed? Pure, immutable.
CREATE OR REPLACE FUNCTION public.translation_order_transition_allowed(
  p_from text,
  p_to   text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_from, p_to) IN (
    ('queued','assigned'),
    ('queued','cancelled'),
    ('assigned','in_review'),
    ('assigned','queued'),                       -- unassign
    ('assigned','cancelled'),
    ('in_review','needs_user_clarification'),
    ('in_review','approved_for_render'),
    ('in_review','cancelled'),
    ('needs_user_clarification','in_review'),
    ('needs_user_clarification','cancelled'),
    ('approved_for_render','artifact_generated'),
    ('approved_for_render','in_review'),          -- operator reopens before render
    ('artifact_generated','delivery_pending'),
    ('delivery_pending','delivered'),
    ('delivery_pending','delivery_failed'),
    ('delivery_failed','delivery_pending'),        -- retry
    ('delivery_failed','cancelled')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.translation_order_transition_allowed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translation_order_transition_allowed(text, text) TO service_role;

-- The ONLY sanctioned way to change an order's status/version.
CREATE OR REPLACE FUNCTION public.transition_translation_order(
  p_order_id         uuid,
  p_expected_version integer,
  p_expected_status  text,
  p_to_status        text,
  p_actor            text,
  p_reason           text,
  p_metadata         jsonb
)
RETURNS TABLE(order_id uuid, new_status text, new_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur_status  text;
  v_cur_version integer;
  v_lock_key    bigint;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'ORDER_ACTOR_REQUIRED: actor must be non-null' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize concurrent transitions on the same order (64-bit advisory xact lock).
  v_lock_key := hashtextextended(p_order_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT status, version INTO v_cur_status, v_cur_version
  FROM public.translation_orders_v2
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_status <> p_expected_status THEN
    RAISE EXCEPTION 'ORDER_STATE_CONFLICT expected=% current=%', p_expected_status, v_cur_status
      USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_version <> p_expected_version THEN
    RAISE EXCEPTION 'ORDER_VERSION_CONFLICT expected=% current=%', p_expected_version, v_cur_version
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.translation_order_transition_allowed(v_cur_status, p_to_status) THEN
    RAISE EXCEPTION 'ORDER_INVALID_TRANSITION from=% to=%', v_cur_status, p_to_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Authorize this single UPDATE through the immutability trigger via a txn-local GUC.
  PERFORM set_config('translation_orders.allow_transition', 'on', true);

  UPDATE public.translation_orders_v2
  SET status = p_to_status,
      version = v_cur_version + 1,
      updated_at = now(),
      paid_at = CASE WHEN p_to_status = 'assigned' AND paid_at IS NULL THEN now() ELSE paid_at END,
      completed_at = CASE WHEN p_to_status = 'delivered' THEN now() ELSE completed_at END
  WHERE id = p_order_id;

  PERFORM set_config('translation_orders.allow_transition', 'off', true);

  INSERT INTO public.translation_order_events
    (order_id, from_status, to_status, version, actor, reason, metadata)
  VALUES
    (p_order_id, v_cur_status, p_to_status, v_cur_version + 1, p_actor, p_reason, p_metadata);

  RETURN QUERY SELECT p_order_id, p_to_status, v_cur_version + 1;
END;
$$;

COMMENT ON FUNCTION public.transition_translation_order(uuid, integer, text, text, text, text, jsonb) IS
  'ONLY sanctioned status/version mutator for translation_orders_v2. Advisory-locks the order, '
  'verifies expected status+version under lock (ORDER_STATE_CONFLICT/ORDER_VERSION_CONFLICT), '
  'validates the transition (ORDER_INVALID_TRANSITION), requires actor (ORDER_ACTOR_REQUIRED), '
  'bumps version, and appends an event. Sets a txn-local GUC the BEFORE UPDATE trigger honors. '
  'SECURITY DEFINER, service_role only.';

REVOKE EXECUTE ON FUNCTION public.transition_translation_order(uuid, integer, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_translation_order(uuid, integer, text, text, text, text, jsonb) TO service_role;

-- ============================================================================
-- 4. Guards: orders status/version may change ONLY through the RPC; events append-only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.translation_orders_v2_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Block status changes and version decrements unless authorized by the transition RPC.
  IF current_setting('translation_orders.allow_transition', true) = 'on' THEN
    -- Inside the sanctioned RPC: still forbid version going backwards.
    IF NEW.version < OLD.version THEN
      RAISE EXCEPTION 'ORDER_VERSION_DECREMENT_FORBIDDEN old=% new=%', OLD.version, NEW.version
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- Outside the RPC: status is immutable here.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'ORDER_STATUS_DIRECT_CHANGE_FORBIDDEN: use transition_translation_order() (% -> %)',
      OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  -- Outside the RPC: version may never change at all.
  IF NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'ORDER_VERSION_DIRECT_CHANGE_FORBIDDEN old=% new=%', OLD.version, NEW.version
      USING ERRCODE = 'P0001';
  END IF;
  -- Identity columns are immutable regardless of path.
  IF NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id THEN
    RAISE EXCEPTION 'ORDER_CHECKOUT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  -- canonical binding may be set once (NULL -> value) but never re-pointed.
  IF OLD.canonical_document_id IS NOT NULL
     AND NEW.canonical_document_id IS DISTINCT FROM OLD.canonical_document_id THEN
    RAISE EXCEPTION 'ORDER_CANONICAL_REBIND_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_translation_orders_v2_update_guard ON public.translation_orders_v2;
CREATE TRIGGER trg_translation_orders_v2_update_guard
  BEFORE UPDATE ON public.translation_orders_v2
  FOR EACH ROW EXECUTE FUNCTION public.translation_orders_v2_update_guard();

REVOKE EXECUTE ON FUNCTION public.translation_orders_v2_update_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.translation_order_events_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Guarded admin cleanup may DELETE sentinel rows only.
  IF current_setting('translation_orders.allow_admin_cleanup', true) = 'on'
     AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ORDER_EVENTS_APPEND_ONLY: translation_order_events rows are append-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_translation_order_events_no_update ON public.translation_order_events;
DROP TRIGGER IF EXISTS trg_translation_order_events_no_delete ON public.translation_order_events;
CREATE TRIGGER trg_translation_order_events_no_update
  BEFORE UPDATE ON public.translation_order_events
  FOR EACH ROW EXECUTE FUNCTION public.translation_order_events_append_only_guard();
CREATE TRIGGER trg_translation_order_events_no_delete
  BEFORE DELETE ON public.translation_order_events
  FOR EACH ROW EXECUTE FUNCTION public.translation_order_events_append_only_guard();

REVOKE EXECUTE ON FUNCTION public.translation_order_events_append_only_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_translation_orders_v2_update_guard ON public.translation_orders_v2;
-- DROP TRIGGER IF EXISTS trg_translation_order_events_no_update ON public.translation_order_events;
-- DROP TRIGGER IF EXISTS trg_translation_order_events_no_delete ON public.translation_order_events;
-- DROP FUNCTION IF EXISTS public.transition_translation_order(uuid,integer,text,text,text,text,jsonb);
-- DROP FUNCTION IF EXISTS public.translation_order_transition_allowed(text,text);
-- DROP FUNCTION IF EXISTS public.translation_orders_v2_update_guard();
-- DROP FUNCTION IF EXISTS public.translation_order_events_append_only_guard();
-- DROP TABLE IF EXISTS public.translation_order_events;
-- DROP TABLE IF EXISTS public.translation_orders_v2;
