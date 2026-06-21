/**
 * stagingContract — V1_COMPLETION phase STAGING_CONTROL_PLANE.
 *
 * Fail-closed contract that a benchmark / E2E run targets a DEDICATED staging
 * environment, never production. Pure + dependency-free + side-effect-free:
 * it validates env, it NEVER creates resources and NEVER makes network calls.
 *
 * Production identifiers are HARD-FORBIDDEN in any staging-scoped value.
 */

/** Production identifiers that must never appear in a staging-scoped value. */
export const PROD_FORBIDDEN_MARKERS: readonly string[] = [
  'messenginfo.com', // production host
  'rtfxrlountkoegsseukx', // production Supabase project ref
  'sk_live_', // Stripe live secret key prefix
  'pk_live_', // Stripe live publishable key prefix
]

/** Env vars required for any staging benchmark/E2E run. */
export const REQUIRED_STAGING_ENV: readonly string[] = [
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'STAGING_APP_URL',
  'STRIPE_TEST_MODE', // must be exactly "test"
  'STAGING_OCR_PROVIDER_KEY',
]

export type StagingValidation = {
  ok: boolean
  errors: string[]
}

/** True if a value references a production identifier (case-insensitive). */
export function referencesProduction(value: string | undefined | null): boolean {
  const v = (value ?? '').toLowerCase()
  if (!v) return false
  return PROD_FORBIDDEN_MARKERS.some((m) => v.includes(m.toLowerCase()))
}

/**
 * Throws if a benchmark/E2E target is a production resource. Use at the top of
 * any staging-only job. Never logs the value.
 */
export function assertNotProductionTarget(target: string | undefined | null, label = 'target'): void {
  if (referencesProduction(target)) {
    throw new Error(`staging_contract_violation: ${label} references a production identifier`)
  }
}

/**
 * Fail-closed validation of a staging env. Returns { ok:false, errors } if any
 * required var is missing, if STRIPE_TEST_MODE !== "test", or if any staging
 * value references production. Does NOT print secret values.
 */
export function validateStagingEnv(env: Record<string, string | undefined>): StagingValidation {
  const errors: string[] = []

  for (const key of REQUIRED_STAGING_ENV) {
    if (!env[key] || !String(env[key]).trim()) {
      errors.push(`missing_required_env:${key}`)
    }
  }

  if (env.STRIPE_TEST_MODE && env.STRIPE_TEST_MODE !== 'test') {
    errors.push('stripe_test_mode_must_be_test')
  }

  // No staging-scoped value may point at production.
  for (const key of REQUIRED_STAGING_ENV) {
    if (referencesProduction(env[key])) {
      errors.push(`staging_value_references_production:${key}`)
    }
  }

  return { ok: errors.length === 0, errors }
}
