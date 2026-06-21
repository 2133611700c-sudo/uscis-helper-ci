-- ============================================================
-- AUTO-GRANT EVENT TRIGGER — Supabase Oct 30 2026 Fix
-- ============================================================
-- Function placed in extensions schema (not exposed via REST API)
-- to avoid Security Advisor warnings.
-- Trigger fires on every CREATE TABLE in public schema.
-- ============================================================

-- Explicit grants for all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.form_sessions, public.form_answers,
  public.form_editions, public.generated_packets, public.audit_log,
  public.audit_logs, public.canonical_answers, public.official_sources,
  public.certification_records, public.manual_answers,
  public.manual_review_queue, public.manual_review_events,
  public.session_documents, public.session_members, public.extracted_fields,
  public.extraction_runs, public.numeric_evidence, public.user_corrections,
  public.assistant_threads, public.wizard_sessions, public.translations_orders,
  public.translation_orders, public.translation_sessions,
  public.translation_documents, public.translation_events,
  public.translation_payments, public.translation_quality_log,
  public.final_renders, public.tps_ocr_audit, public.monitoring_alerts,
  public.monitoring_sources, public.dead_links_log, public.email_events
TO anon, authenticated;

-- Create private schema for internal functions
CREATE SCHEMA IF NOT EXISTS extensions;

-- Auto-grant function in extensions schema (not exposed to REST API)
CREATE OR REPLACE FUNCTION extensions.auto_grant_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO anon, authenticated',
      obj.object_identity
    );
  END LOOP;
END;
$$;

-- Fix search_path on all existing public functions
ALTER FUNCTION public.is_admin()                              SET search_path = '';
ALTER FUNCTION public.is_moderator_or_admin()                 SET search_path = '';
ALTER FUNCTION public.set_updated_at()                        SET search_path = '';
ALTER FUNCTION public.tg_manual_review_queue_set_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column()              SET search_path = '';
ALTER FUNCTION public.handle_new_user()                       SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Event trigger (points to extensions schema)
DROP EVENT TRIGGER IF EXISTS auto_grant_public_tables;
CREATE EVENT TRIGGER auto_grant_public_tables
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION extensions.auto_grant_on_new_table();

-- Remove old public function if it exists
DROP FUNCTION IF EXISTS public.auto_grant_on_new_table();
