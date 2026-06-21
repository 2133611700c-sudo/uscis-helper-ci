-- ============================================================
-- Migration: 20260502000001_wizard_schema.sql
-- Purpose:   Wizard tables for Re-Parole U4U self-service flow
-- Author:    Mia Wizard System
-- Date:      2026-05-02
-- Depends:   20260429000001_init_schema.sql (profiles, form_sessions, etc.)
-- ============================================================

-- ============================================================
-- HELPER: update_updated_at_column (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLE: wizard_sessions
-- One row per anonymous family unit starting the Re-Parole U4U wizard.
-- anon_user_id comes from browser localStorage — NOT auth.users.
-- state_json may contain PII; Supabase encrypts at rest.
-- ============================================================
CREATE TABLE public.wizard_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_user_id    UUID        NOT NULL,              -- from localStorage, NOT auth.users
  service_slug    TEXT        NOT NULL DEFAULT 're-parole-u4u',
  locale          TEXT        NOT NULL DEFAULT 'ru', -- ru|uk|en|es
  current_step    INT         NOT NULL DEFAULT 0,    -- 0-12
  state_json      JSONB       NOT NULL DEFAULT '{}', -- wizard state (may contain PII, encrypted at rest)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);

COMMENT ON TABLE  public.wizard_sessions              IS 'One session per anonymous family unit going through the wizard. anon_user_id from localStorage, never auth.users.';
COMMENT ON COLUMN public.wizard_sessions.anon_user_id IS 'UUID stored in browser localStorage. No link to auth.users — wizard is fully anonymous.';
COMMENT ON COLUMN public.wizard_sessions.service_slug IS 'Which wizard product this session belongs to (re-parole-u4u, etc.).';
COMMENT ON COLUMN public.wizard_sessions.locale       IS 'UI locale selected by user: ru|uk|en|es.';
COMMENT ON COLUMN public.wizard_sessions.current_step IS 'Last completed wizard step index (0-12).';
COMMENT ON COLUMN public.wizard_sessions.state_json   IS 'Full wizard state snapshot. May contain PII. Supabase AES-256 at rest.';
COMMENT ON COLUMN public.wizard_sessions.expires_at   IS 'Session auto-expires after 90 days. Cron job should purge expired rows.';

-- ============================================================
-- TABLE: session_members
-- Each person in the family unit gets a row.
-- member_index=0 is always the primary applicant.
-- alias is a display label ("Person 1") — NOT the real name.
-- ============================================================
CREATE TABLE public.session_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  member_index    INT         NOT NULL DEFAULT 0,    -- 0 = primary applicant
  alias           TEXT,                              -- display alias e.g. "Person 1", NOT real name
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.session_members              IS 'Family members within a wizard session. member_index=0 is the primary applicant.';
COMMENT ON COLUMN public.session_members.member_index IS '0 = primary applicant; 1+ = dependents.';
COMMENT ON COLUMN public.session_members.alias        IS 'Non-PII display label shown in UI ("Person 1"). Never store real name here.';

-- ============================================================
-- TABLE: session_documents
-- Each uploaded file gets a row. PII must NOT appear in storage_path.
-- Path format: wizard/{session_id}/{member_id}/{doc_type}/{uuid}
-- ============================================================
CREATE TABLE public.session_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  member_id       UUID                   REFERENCES public.session_members(id) ON DELETE SET NULL,
  doc_type        TEXT        NOT NULL,              -- 'passport'|'i94'|'parole_notice'|'photo'|etc
  storage_path    TEXT        NOT NULL UNIQUE,       -- path in Supabase Storage (no PII in path)
  ocr_status      TEXT        NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  file_size_bytes INT,
  mime_type       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

COMMENT ON TABLE  public.session_documents              IS 'Uploaded documents per session member. Storage paths must contain no PII — use UUIDs only.';
COMMENT ON COLUMN public.session_documents.doc_type     IS 'Document type: passport|i94|parole_notice|photo|birth_certificate|etc.';
COMMENT ON COLUMN public.session_documents.storage_path IS 'Supabase Storage path. Pattern: wizard/{session_id}/{member_id}/{doc_type}/{uuid}. Must be globally unique.';
COMMENT ON COLUMN public.session_documents.ocr_status   IS 'OCR pipeline status: pending|processing|done|failed.';
COMMENT ON COLUMN public.session_documents.expires_at   IS 'Document purged from storage after 30 days. Keep in sync with Storage bucket TTL policy.';

-- ============================================================
-- TABLE: extracted_fields
-- Per-field OCR output from documents. field_value may be PII.
-- source distinguishes OCR vs manual correction vs prefill.
-- ============================================================
CREATE TABLE public.extracted_fields (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID         NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  member_id       UUID                    REFERENCES public.session_members(id) ON DELETE SET NULL,
  document_id     UUID                    REFERENCES public.session_documents(id) ON DELETE SET NULL,
  field_key       TEXT         NOT NULL,              -- e.g. 'last_name', 'passport_number'
  field_value     TEXT,                               -- extracted value (may be PII)
  confidence      NUMERIC(4,3),                       -- 0.000-1.000
  source          TEXT         NOT NULL DEFAULT 'ocr', -- 'ocr'|'manual'|'prefill'
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.extracted_fields            IS 'Individual fields extracted from documents via OCR or entered manually.';
COMMENT ON COLUMN public.extracted_fields.field_key  IS 'Canonical field name, e.g. last_name, passport_number, date_of_birth.';
COMMENT ON COLUMN public.extracted_fields.field_value IS 'Extracted or entered value. May contain PII. Encrypted at rest.';
COMMENT ON COLUMN public.extracted_fields.confidence IS 'OCR confidence score 0.000-1.000. NULL for manually entered values.';
COMMENT ON COLUMN public.extracted_fields.source     IS 'How this value was obtained: ocr|manual|prefill.';

-- ============================================================
-- TABLE: manual_answers
-- Step-by-step answers from the wizard UI.
-- UNIQUE constraint prevents duplicate rows for the same question.
-- ============================================================
CREATE TABLE public.manual_answers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  step_key        TEXT        NOT NULL,              -- wizard step identifier, e.g. 'eligibility'
  answer_key      TEXT        NOT NULL,              -- field name within step, e.g. 'entry_date'
  answer_value    TEXT,                              -- user-entered value
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, step_key, answer_key)
);

COMMENT ON TABLE  public.manual_answers              IS 'Step-by-step answers collected by the wizard UI. Upsert on (session_id, step_key, answer_key).';
COMMENT ON COLUMN public.manual_answers.step_key     IS 'Wizard step slug, e.g. eligibility|personal_info|travel_history.';
COMMENT ON COLUMN public.manual_answers.answer_key   IS 'Field name within the step, e.g. entry_date|country_of_birth.';
COMMENT ON COLUMN public.manual_answers.answer_value IS 'Raw user input. May contain PII.';

-- ============================================================
-- TABLE: generated_packets
-- Output ZIP/PDF bundles ready for download/submission.
-- ============================================================
CREATE TABLE public.generated_packets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  storage_path    TEXT        NOT NULL UNIQUE,       -- path in Supabase Storage
  file_size_bytes INT,
  packet_type     TEXT        NOT NULL DEFAULT 'zip', -- 'zip'|'pdf'
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);

COMMENT ON TABLE  public.generated_packets              IS 'Output packets (ZIP or PDF) generated for a wizard session.';
COMMENT ON COLUMN public.generated_packets.storage_path IS 'Supabase Storage path. Pattern: wizard/{session_id}/packet_{uuid}.zip.';
COMMENT ON COLUMN public.generated_packets.packet_type  IS 'Output format: zip (full bundle) or pdf (single form).';
COMMENT ON COLUMN public.generated_packets.expires_at   IS 'Packet auto-purged after 90 days. Matches wizard_sessions TTL.';

-- ============================================================
-- TABLE: assistant_threads
-- Mia AI assistant conversation history per session.
-- messages_json stores [{role, content, ts}] array.
-- ============================================================
CREATE TABLE public.assistant_threads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.wizard_sessions(id) ON DELETE CASCADE,
  messages_json   JSONB       NOT NULL DEFAULT '[]', -- [{role: 'user'|'assistant', content: string, ts: ISO8601}]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.assistant_threads              IS 'Mia AI assistant conversation threads. One thread per wizard session.';
COMMENT ON COLUMN public.assistant_threads.messages_json IS 'Array of {role, content, ts} objects. Role: user|assistant|system.';

-- ============================================================
-- TABLE: email_events
-- Magic link and notification email tracking.
-- IMPORTANT: raw email is NEVER stored — only SHA-256 hash.
-- ============================================================
CREATE TABLE public.email_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID                   REFERENCES public.wizard_sessions(id) ON DELETE SET NULL,
  email_hash      TEXT        NOT NULL,              -- SHA-256(email) — NO raw email stored
  event_type      TEXT        NOT NULL,              -- 'magic_link'|'packet_ready'|'reminder'
  resend_id       TEXT,                              -- Resend message ID for delivery tracking
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.email_events             IS 'Email send/open tracking. Raw email NEVER stored — only SHA-256 hash.';
COMMENT ON COLUMN public.email_events.email_hash  IS 'SHA-256 of the recipient email address. Allows re-identification for opt-out without storing PII.';
COMMENT ON COLUMN public.email_events.event_type  IS 'Email type: magic_link|packet_ready|reminder.';
COMMENT ON COLUMN public.email_events.resend_id   IS 'Message ID returned by Resend API. Used for delivery status webhooks.';
COMMENT ON COLUMN public.email_events.opened_at   IS 'Populated via Resend open-tracking webhook.';

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_wizard_sessions_anon_user   ON public.wizard_sessions(anon_user_id);
CREATE INDEX idx_wizard_sessions_expires_at  ON public.wizard_sessions(expires_at);
CREATE INDEX idx_session_members_session     ON public.session_members(session_id);
CREATE INDEX idx_session_documents_session   ON public.session_documents(session_id, doc_type);
CREATE INDEX idx_manual_answers_session_step ON public.manual_answers(session_id, step_key);

-- ============================================================
-- ROW LEVEL SECURITY
-- All wizard access goes through Next.js server-side API routes
-- using SUPABASE_SERVICE_ROLE_KEY. Service role bypasses RLS
-- implicitly. Anon role has NO direct table access — enforced
-- by these policies (deny-by-default when RLS is enabled).
-- ============================================================

ALTER TABLE public.wizard_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_fields   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_answers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_packets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events       ENABLE ROW LEVEL SECURITY;

-- Service role permissive policies (explicit, for clarity in pg_policies)
-- service_role bypasses RLS implicitly, but these make intent visible in audits.

CREATE POLICY "service_role_all" ON public.wizard_sessions
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.session_members
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.session_documents
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.extracted_fields
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.manual_answers
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.generated_packets
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.assistant_threads
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON public.email_events
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- TRIGGERS: keep updated_at current
-- ============================================================

CREATE TRIGGER trg_wizard_sessions_updated_at
  BEFORE UPDATE ON public.wizard_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_manual_answers_updated_at
  BEFORE UPDATE ON public.manual_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_assistant_threads_updated_at
  BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STORAGE BUCKETS (create via Supabase Dashboard or API):
-- 1. 'documents' — private, 30-day TTL, max 10MB per file
--    Path template: wizard/{session_id}/{member_id}/{doc_type}/{uuid}
-- 2. 'packets'   — private, 90-day TTL, max 50MB per file
--    Path template: wizard/{session_id}/packet_{uuid}.zip
-- Both buckets: RLS via service role only (server-side access)
-- ============================================================
