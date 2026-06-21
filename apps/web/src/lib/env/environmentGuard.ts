/**
 * Environment Isolation Guard — SHADOW-FIRST detection.
 *
 * PURPOSE
 * -------
 * Detect (and, opt-in, refuse) the misconfiguration where a non-production
 * deployment (Preview / Development) silently uses the PRODUCTION Supabase
 * project — i.e. the production service-role key (which bypasses RLS) is set
 * for Preview/Development and therefore reads/writes PRODUCTION data.
 *
 * AUDIT CONTEXT (2026-06-14): only ONE Supabase project exists
 * (ref `rtfxrlountkoegsseukx`). SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 * for Production AND Preview AND Development, so preview/dev deployments operate
 * on prod data with an RLS-bypassing key. Full isolation (separate staging
 * Supabase, removing the prod service-role from preview/dev, fail-closed
 * startup) is BLOCKED_EXTERNAL — the owner must provision a staging project.
 *
 * This module delivers the DETECTION + CONTRACT + GUARD (shadow) so that, the
 * moment a staging project exists, flipping to fail-closed is a single flag
 * (`ENV_ISOLATION_MODE=enforce`).
 *
 * SAFETY
 * ------
 * - SHADOW (default) and OFF NEVER throw. Shadow only emits a structured,
 *   PII-free `console.warn`.
 * - ENFORCE (opt-in) throws `EnvironmentIsolationError`. It is intentionally NOT
 *   wired into any production startup path in this PR.
 * - No secret values are ever read into the fingerprint, logged, or thrown.
 *
 * ============================ ENV VARS ============================
 * APP_ENVIRONMENT      production | preview | development.
 *                      Primary signal for the deployment tier. Falls back to
 *                      VERCEL_ENV, then NODE_ENV. ('test'/'development' NODE_ENV
 *                      → development; 'production' → production.)
 * SUPABASE_ENVIRONMENT (informational alias; same value-space as APP_ENVIRONMENT.
 *                      If set it overrides APP_ENVIRONMENT for the Supabase tier.)
 * SUPABASE_PROJECT_REF Explicit Supabase project ref (e.g. rtfxrlountkoegsseukx).
 *                      If unset, derived from the SUPABASE_URL host
 *                      (https://<ref>.supabase.co → <ref>).
 * STRIPE_MODE          test | live. If unset, derived from the Stripe key prefix
 *                      (sk_test… → test, sk_live… → live). The key itself is
 *                      NEVER logged or stored.
 * PROVIDER_MODE        live | mock. OCR/AI provider mode. Defaults to 'live'.
 * ENV_ISOLATION_MODE   off | shadow | enforce. Default 'shadow'.
 *                      shadow = detect + PII-free warn, never throw.
 *                      enforce = throw on violation (opt-in; not wired to prod).
 *                      off = no-op.
 * =================================================================
 */

/** Known PRODUCTION Supabase project ref (audit-confirmed single project). */
export const PROD_SUPABASE_REF = 'rtfxrlountkoegsseukx';

/** Loose env shape compatible with process.env and test literals. */
export type EnvLike = Record<string, string | undefined>;

export type AppEnvironment = 'production' | 'preview' | 'development';
export type StripeMode = 'test' | 'live' | 'unknown';
export type ProviderMode = 'live' | 'mock';
export type IsolationMode = 'off' | 'shadow' | 'enforce';

export type EnvironmentViolationCode =
  | 'NONPROD_USES_PROD_SUPABASE'
  | 'STAGING_USES_LIVE_STRIPE'
  | 'MISSING_SUPABASE_REF'
  | 'PROD_USES_NONPROD_SUPABASE';

/** PII-free fingerprint of the runtime environment. Contains NO secret values. */
export interface EnvFingerprint {
  appEnv: AppEnvironment;
  /** Supabase project ref (NOT a secret) or null when it could not be resolved. */
  supabaseRef: string | null;
  stripeMode: StripeMode;
  providerMode: ProviderMode;
}

export interface EnvironmentViolation {
  code: EnvironmentViolationCode;
  message: string;
}

/** Thrown ONLY in enforce mode. Lists the violation codes (no secrets/PII). */
export class EnvironmentIsolationError extends Error {
  readonly violationCodes: EnvironmentViolationCode[];
  constructor(violations: EnvironmentViolation[]) {
    const codes = violations.map((v) => v.code);
    super(`Environment isolation violation(s): ${codes.join(', ')}`);
    this.name = 'EnvironmentIsolationError';
    this.violationCodes = codes;
  }
}

/** Normalise an arbitrary env string to a typed AppEnvironment. */
function normalizeAppEnv(raw: string | undefined): AppEnvironment | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'production' || v === 'prod') return 'production';
  if (v === 'preview' || v === 'staging') return 'preview';
  if (v === 'development' || v === 'dev' || v === 'test') return 'development';
  return null;
}

/**
 * Derive the Supabase project ref from a SUPABASE_URL host.
 * https://<ref>.supabase.co → <ref>. Returns null when not derivable.
 * Exported for testing.
 */
export function deriveSupabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).host; // e.g. rtfxrlountkoegsseukx.supabase.co
    const label = host.split('.')[0];
    if (label && /^[a-z0-9-]+$/i.test(label) && host.includes('.supabase.')) {
      return label;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveStripeMode(env: EnvLike): StripeMode {
  const explicit = env.STRIPE_MODE?.trim().toLowerCase();
  if (explicit === 'test' || explicit === 'live') return explicit;
  // Derive from key prefix WITHOUT logging or storing the key value.
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (key.startsWith('sk_test')) return 'test';
  if (key.startsWith('sk_live')) return 'live';
  return 'unknown';
}

function resolveProviderMode(env: EnvLike): ProviderMode {
  const v = env.PROVIDER_MODE?.trim().toLowerCase();
  return v === 'mock' ? 'mock' : 'live';
}

/**
 * Build a PII-free EnvFingerprint from process.env (or an injected env for tests).
 */
export function resolveEnvironment(env: EnvLike = process.env): EnvFingerprint {
  const appEnv =
    normalizeAppEnv(env.APP_ENVIRONMENT) ??
    normalizeAppEnv(env.VERCEL_ENV) ??
    normalizeAppEnv(env.NODE_ENV) ??
    'production'; // safest default: treat unknown as production (no false "isolation clean")

  // SUPABASE_ENVIRONMENT may refine the Supabase tier, but appEnv stays the
  // primary deployment signal; we keep a single appEnv for consistency checks.
  const supabaseRef =
    env.SUPABASE_PROJECT_REF?.trim() || deriveSupabaseRefFromUrl(env.SUPABASE_URL) || null;

  return {
    appEnv,
    supabaseRef,
    stripeMode: resolveStripeMode(env),
    providerMode: resolveProviderMode(env),
  };
}

/**
 * Pure consistency check. Returns a list of typed, PII-free violations.
 */
export function checkEnvironmentConsistency(fp: EnvFingerprint): EnvironmentViolation[] {
  const violations: EnvironmentViolation[] = [];
  const isProd = fp.appEnv === 'production';

  if (fp.supabaseRef === null) {
    violations.push({
      code: 'MISSING_SUPABASE_REF',
      message: 'Supabase project ref could not be resolved (no SUPABASE_PROJECT_REF and SUPABASE_URL not derivable).',
    });
  }

  if (!isProd && fp.supabaseRef === PROD_SUPABASE_REF) {
    violations.push({
      code: 'NONPROD_USES_PROD_SUPABASE',
      message: `Non-production environment (${fp.appEnv}) is pointed at the PRODUCTION Supabase project. Preview/dev would read/write prod data with an RLS-bypassing service-role key.`,
    });
  }

  if (isProd && fp.supabaseRef !== null && fp.supabaseRef !== PROD_SUPABASE_REF) {
    violations.push({
      code: 'PROD_USES_NONPROD_SUPABASE',
      message: 'Production environment is pointed at a NON-production Supabase project.',
    });
  }

  if (!isProd && fp.stripeMode === 'live') {
    violations.push({
      code: 'STAGING_USES_LIVE_STRIPE',
      message: `Non-production environment (${fp.appEnv}) is using LIVE Stripe keys; real charges possible.`,
    });
  }

  return violations;
}

function resolveIsolationMode(env: EnvLike): IsolationMode {
  const v = env.ENV_ISOLATION_MODE?.trim().toLowerCase();
  if (v === 'off' || v === 'enforce') return v;
  return 'shadow';
}

/**
 * Assert environment consistency according to ENV_ISOLATION_MODE.
 *
 * - off      → no-op.
 * - shadow   → emit a structured, PII-free console.warn per violation; NEVER throws.
 * - enforce  → throw EnvironmentIsolationError listing violation codes (opt-in).
 *
 * Returns the violations found (empty when clean). NEVER throws in shadow/off.
 * NOT wired into any production startup path in this PR.
 */
export function assertEnvironmentConsistency(
  env: EnvLike = process.env,
): EnvironmentViolation[] {
  const mode = resolveIsolationMode(env);
  if (mode === 'off') return [];

  const fp = resolveEnvironment(env);
  const violations = checkEnvironmentConsistency(fp);
  if (violations.length === 0) return violations;

  if (mode === 'shadow') {
    for (const v of violations) {
      // Structured, PII-free event. supabaseRef PRESENCE only (not the value),
      // and never any secret. Safe to ship to logs.
      console.warn(
        JSON.stringify({
          event: 'env_isolation_violation',
          appEnv: fp.appEnv,
          supabaseRef_present: fp.supabaseRef !== null,
          stripeMode: fp.stripeMode,
          providerMode: fp.providerMode,
          violation_code: v.code,
          mode,
        }),
      );
    }
    return violations;
  }

  // enforce
  throw new EnvironmentIsolationError(violations);
}
