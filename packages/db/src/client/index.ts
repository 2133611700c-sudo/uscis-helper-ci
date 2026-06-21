import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Browser / SSR client — uses anon key, respects RLS
export function createBrowserClient() {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}

// Server-side client — uses service role key, bypasses RLS
// Use ONLY in trusted server contexts (API routes, cron workers, migrations)
export function createServerClient() {
  return createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export type BrowserClient = ReturnType<typeof createBrowserClient>;
export type ServerClient = ReturnType<typeof createServerClient>;
