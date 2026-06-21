// SERVER ONLY. DO NOT IMPORT IN CLIENT CODE.
import { createClient } from '@supabase/supabase-js';
import { assertEnvironmentConsistency } from '@/lib/env/environmentGuard';

// One-time environment-isolation observation. SHADOW by default: this only
// LOGS a structured, PII-free violation event (e.g. preview/dev using the prod
// Supabase project) and NEVER throws. It does NOT gate client creation — shadow
// = observe only. enforce mode is opt-in via ENV_ISOLATION_MODE and is NOT
// wired here for production startup; even if set, this call sits outside any
// prod startup path and is best-effort.
let envIsolationChecked = false;
function observeEnvironmentIsolationOnce(): void {
  if (envIsolationChecked) return;
  envIsolationChecked = true;
  try {
    assertEnvironmentConsistency();
  } catch {
    // Defence in depth: never let the guard break the admin client. In shadow
    // (default) it cannot throw; this only catches an opt-in enforce flag set
    // in a non-prod context, which must still not crash client creation here.
  }
}

export function createAdminSupabaseClient() {
  observeEnvironmentIsolationOnce();
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
