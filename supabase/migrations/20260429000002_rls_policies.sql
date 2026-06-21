-- ============================================================
-- USCIS Helper — RLS Policies v1
-- Enable RLS on all tables, define per-role access.
-- ============================================================

-- Enable RLS
alter table public.profiles             enable row level security;
alter table public.user_sessions        enable row level security;
alter table public.translations_orders  enable row level security;
alter table public.translation_files    enable row level security;
alter table public.form_sessions        enable row level security;
alter table public.form_answers         enable row level security;
alter table public.official_sources     enable row level security;
alter table public.canonical_answers    enable row level security;
alter table public.risk_flags           enable row level security;
alter table public.moderation_queue     enable row level security;
alter table public.bot_threads          enable row level security;
alter table public.scanner_hits         enable row level security;
alter table public.facebook_leads       enable row level security;
alter table public.audit_log            enable row level security;

-- ============================================================
-- HELPER: check if current user is admin or moderator
-- ============================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_moderator_or_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

-- ============================================================
-- profiles
-- ============================================================

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid() or public.is_moderator_or_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

-- ============================================================
-- user_sessions
-- ============================================================

create policy "sessions_select_own"
  on public.user_sessions for select
  using (user_id = auth.uid() or public.is_moderator_or_admin());

create policy "sessions_insert_own"
  on public.user_sessions for insert
  with check (user_id = auth.uid() or user_id is null);

-- ============================================================
-- translations_orders
-- ============================================================

create policy "orders_select_own"
  on public.translations_orders for select
  using (user_id = auth.uid() or public.is_moderator_or_admin());

create policy "orders_insert_own"
  on public.translations_orders for insert
  with check (user_id = auth.uid());

create policy "orders_update_own"
  on public.translations_orders for update
  using (user_id = auth.uid() or public.is_moderator_or_admin());

-- ============================================================
-- translation_files
-- ============================================================

create policy "files_select_via_order"
  on public.translation_files for select
  using (
    exists (
      select 1 from public.translations_orders o
      where o.id = translation_files.order_id
        and (o.user_id = auth.uid() or public.is_moderator_or_admin())
    )
  );

create policy "files_insert_via_order"
  on public.translation_files for insert
  with check (
    exists (
      select 1 from public.translations_orders o
      where o.id = translation_files.order_id
        and o.user_id = auth.uid()
    )
  );

-- ============================================================
-- form_sessions
-- ============================================================

create policy "form_sessions_select_own"
  on public.form_sessions for select
  using (user_id = auth.uid() or public.is_moderator_or_admin());

create policy "form_sessions_insert_own"
  on public.form_sessions for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "form_sessions_update_own"
  on public.form_sessions for update
  using (user_id = auth.uid());

-- ============================================================
-- form_answers
-- ============================================================

create policy "form_answers_select_via_session"
  on public.form_answers for select
  using (
    exists (
      select 1 from public.form_sessions s
      where s.id = form_answers.session_id
        and (s.user_id = auth.uid() or public.is_moderator_or_admin())
    )
  );

create policy "form_answers_insert_via_session"
  on public.form_answers for insert
  with check (
    exists (
      select 1 from public.form_sessions s
      where s.id = form_answers.session_id
        and (s.user_id = auth.uid() or s.user_id is null)
    )
  );

-- ============================================================
-- official_sources — public read, admin write
-- ============================================================

create policy "official_sources_select_all"
  on public.official_sources for select
  using (true);

create policy "official_sources_write_admin"
  on public.official_sources for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- canonical_answers — published = public read, admin write
-- ============================================================

create policy "canonical_answers_select_published"
  on public.canonical_answers for select
  using (is_published = true or public.is_moderator_or_admin());

create policy "canonical_answers_write_moderator"
  on public.canonical_answers for all
  using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

-- ============================================================
-- risk_flags
-- ============================================================

create policy "risk_flags_select_own"
  on public.risk_flags for select
  using (user_id = auth.uid() or public.is_moderator_or_admin());

create policy "risk_flags_insert_system"
  on public.risk_flags for insert
  with check (public.is_moderator_or_admin() or user_id = auth.uid());

-- ============================================================
-- moderation_queue — moderator only
-- ============================================================

create policy "moderation_queue_moderator"
  on public.moderation_queue for all
  using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

-- ============================================================
-- bot_threads
-- ============================================================

create policy "bot_threads_select_own"
  on public.bot_threads for select
  using (user_id = auth.uid() or public.is_moderator_or_admin());

-- bot threads are created/updated by server-side service role only
-- no client-side insert policy intentionally

-- ============================================================
-- scanner_hits — admin/service role only
-- ============================================================

create policy "scanner_hits_admin"
  on public.scanner_hits for all
  using (public.is_admin());

-- ============================================================
-- facebook_leads — moderator only
-- ============================================================

create policy "facebook_leads_moderator"
  on public.facebook_leads for all
  using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

-- ============================================================
-- audit_log — append only, admin read
-- ============================================================

create policy "audit_log_insert_any_authed"
  on public.audit_log for insert
  with check (auth.uid() is not null);

create policy "audit_log_select_admin"
  on public.audit_log for select
  using (public.is_admin());

-- No update/delete policies — audit_log is append-only by design.
