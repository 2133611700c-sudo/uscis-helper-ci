-- ============================================================
-- Minimize schema to v1: drop 9 tables not needed yet.
-- Verified all counts = 0 before running.
-- Keeps: profiles, form_sessions, form_answers,
--        translations_orders, audit_log
-- ============================================================

-- Drop tables (CASCADE removes their RLS policies, indexes, triggers)
DROP TABLE IF EXISTS public.user_sessions     CASCADE;
DROP TABLE IF EXISTS public.translation_files CASCADE;
DROP TABLE IF EXISTS public.official_sources  CASCADE;
DROP TABLE IF EXISTS public.canonical_answers CASCADE;
DROP TABLE IF EXISTS public.risk_flags        CASCADE;
DROP TABLE IF EXISTS public.moderation_queue  CASCADE;
DROP TABLE IF EXISTS public.bot_threads       CASCADE;
DROP TABLE IF EXISTS public.scanner_hits      CASCADE;
DROP TABLE IF EXISTS public.facebook_leads    CASCADE;

-- Drop orphaned enum types (only used by dropped tables)
DROP TYPE IF EXISTS public.risk_level        CASCADE;
DROP TYPE IF EXISTS public.moderation_status CASCADE;
DROP TYPE IF EXISTS public.source_type       CASCADE;
DROP TYPE IF EXISTS public.bot_platform      CASCADE;
DROP TYPE IF EXISTS public.lead_status       CASCADE;

-- Enums kept (still used by remaining 5 tables):
--   user_role        → profiles
--   language_code    → profiles, form_sessions, translations_orders
--   order_status     → translations_orders
--   form_type        → form_sessions

-- Helper functions kept (used in RLS of remaining tables):
--   is_admin()                → audit_log select policy
--   is_moderator_or_admin()   → profiles, form_sessions, form_answers,
--                               translations_orders policies
