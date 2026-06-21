-- Migration: durable packet-token replay ledger (#184 — requirePaidPacket replay store)
-- FORWARD-ONLY + ADDITIVE. Creates ONE new append-only table + a guarded consume RPC.
-- No existing table/function/trigger is altered or dropped.
--
-- WHY: requirePaidPacket prevents a single payment-verified Stripe token from minting more than
-- one packet per product. That replay guard was per-instance in-memory only — a serverless
-- recycle or a second instance reset it, so a confirmed token could be replayed across instances.
-- This ledger makes the "already consumed" check durable + cross-instance. It is NOT a payment
-- check (payment is verified upstream); it only prevents re-use of an already-spent token.
--
-- PII: stores ONLY (opaque Stripe token id, product slug, timestamp). No email, name, amount,
-- session state, or raw payload — same PII discipline as stripe_processed_events.

-- ============================================================================
-- 1. stripe_consumed_tokens — append-only (product, token) consume ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_consumed_tokens (
  product       text        NOT NULL,
  -- Opaque Stripe checkout/payment id (cs_.../py_...). Never a raw payload.
  token         text        NOT NULL,
  consumed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, token)
);

COMMENT ON TABLE public.stripe_consumed_tokens IS
  'Append-only durable replay ledger for paid packet tokens. PRIMARY KEY (product, token) makes a '
  'second consume of the same payment-verified token a no-op (inserted=false ⇒ replay). '
  'PII-free: opaque Stripe id + product slug + timestamp only.';

ALTER TABLE public.stripe_consumed_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_consumed_tokens FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS service_role_all_stripe_consumed_tokens ON public.stripe_consumed_tokens;
CREATE POLICY service_role_all_stripe_consumed_tokens
  ON public.stripe_consumed_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Append-only guard — consume rows are never UPDATEd/DELETEd (except sentinel cleanup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stripe_consumed_tokens_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Guarded sentinel cleanup may DELETE PHASE2_TEST_ rows only.
  IF current_setting('translation_orders.allow_admin_cleanup', true) = 'on'
     AND TG_OP = 'DELETE'
     AND COALESCE(OLD.token, '') LIKE 'PHASE2_TEST_%' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'STRIPE_CONSUMED_TOKENS_APPEND_ONLY: rows are append-only (% denied)', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_consumed_tokens_no_update ON public.stripe_consumed_tokens;
DROP TRIGGER IF EXISTS trg_stripe_consumed_tokens_no_delete ON public.stripe_consumed_tokens;
CREATE TRIGGER trg_stripe_consumed_tokens_no_update
  BEFORE UPDATE ON public.stripe_consumed_tokens
  FOR EACH ROW EXECUTE FUNCTION public.stripe_consumed_tokens_append_only_guard();
CREATE TRIGGER trg_stripe_consumed_tokens_no_delete
  BEFORE DELETE ON public.stripe_consumed_tokens
  FOR EACH ROW EXECUTE FUNCTION public.stripe_consumed_tokens_append_only_guard();

REVOKE EXECUTE ON FUNCTION public.stripe_consumed_tokens_append_only_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. consume_stripe_packet_token — idempotent consume (returns whether it was new)
-- ============================================================================
-- INSERT ... ON CONFLICT DO NOTHING on (product, token). inserted=true ⇒ this caller is the FIRST
-- to consume the token (allow the packet); inserted=false ⇒ a replay (deny).

CREATE OR REPLACE FUNCTION public.consume_stripe_packet_token(
  p_product text,
  p_token   text
)
RETURNS TABLE(inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  IF p_product IS NULL OR length(btrim(p_product)) = 0
     OR p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RAISE EXCEPTION 'CONSUME_TOKEN_ARGS_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.stripe_consumed_tokens (product, token)
  VALUES (p_product, p_token)
  ON CONFLICT (product, token) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN QUERY SELECT (v_inserted)::boolean;
END;
$$;

COMMENT ON FUNCTION public.consume_stripe_packet_token(text, text) IS
  'Idempotently consume a paid packet token. INSERT ON CONFLICT DO NOTHING on (product, token); '
  'returns inserted=true when this caller is the FIRST to consume it (allow) or inserted=false on '
  'a replay (deny). SECURITY DEFINER, service_role only. PII-free.';

REVOKE EXECUTE ON FUNCTION public.consume_stripe_packet_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stripe_packet_token(text, text) TO service_role;

-- ============================================================================
-- ROLLBACK (manual only)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_stripe_consumed_tokens_no_update ON public.stripe_consumed_tokens;
-- DROP TRIGGER IF EXISTS trg_stripe_consumed_tokens_no_delete ON public.stripe_consumed_tokens;
-- DROP FUNCTION IF EXISTS public.consume_stripe_packet_token(text, text);
-- DROP FUNCTION IF EXISTS public.stripe_consumed_tokens_append_only_guard();
-- DROP TABLE IF EXISTS public.stripe_consumed_tokens;
