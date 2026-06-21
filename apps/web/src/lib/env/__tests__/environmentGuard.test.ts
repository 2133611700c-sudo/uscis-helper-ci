import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PROD_SUPABASE_REF,
  resolveEnvironment,
  checkEnvironmentConsistency,
  assertEnvironmentConsistency,
  deriveSupabaseRefFromUrl,
  EnvironmentIsolationError,
  type EnvFingerprint,
  type EnvironmentViolationCode,
} from '../environmentGuard';

const OTHER_REF = 'abcdefghijklmnopqrst';

function codes(violations: { code: EnvironmentViolationCode }[]): EnvironmentViolationCode[] {
  return violations.map((v) => v.code);
}

describe('environmentGuard', () => {
  // Save/restore the driven process.env keys per test (snapshot + restore).
  const DRIVEN_KEYS = [
    'APP_ENVIRONMENT',
    'SUPABASE_ENVIRONMENT',
    'VERCEL_ENV',
    'NODE_ENV',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'STRIPE_MODE',
    'STRIPE_SECRET_KEY',
    'PROVIDER_MODE',
    'ENV_ISOLATION_MODE',
  ] as const;
  const SNAPSHOT: Record<string, string | undefined> = {};
  const mutableEnv = process.env as Record<string, string | undefined>;
  beforeEach(() => {
    for (const k of DRIVEN_KEYS) {
      SNAPSHOT[k] = mutableEnv[k];
      delete mutableEnv[k];
    }
  });
  afterEach(() => {
    for (const k of DRIVEN_KEYS) {
      if (SNAPSHOT[k] === undefined) delete mutableEnv[k];
      else mutableEnv[k] = SNAPSHOT[k];
    }
    vi.restoreAllMocks();
  });

  describe('resolveEnvironment', () => {
    it('derives supabaseRef from SUPABASE_URL host when SUPABASE_PROJECT_REF unset', () => {
      const fp = resolveEnvironment({
        APP_ENVIRONMENT: 'preview',
        SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
      });
      expect(fp.supabaseRef).toBe(PROD_SUPABASE_REF);
      expect(fp.appEnv).toBe('preview');
    });

    it('prefers explicit SUPABASE_PROJECT_REF over the URL-derived ref', () => {
      const fp = resolveEnvironment({
        APP_ENVIRONMENT: 'production',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
        SUPABASE_URL: `https://${OTHER_REF}.supabase.co`,
      });
      expect(fp.supabaseRef).toBe(PROD_SUPABASE_REF);
    });

    it('falls back VERCEL_ENV then NODE_ENV for appEnv', () => {
      expect(resolveEnvironment({ VERCEL_ENV: 'preview' }).appEnv).toBe('preview');
      expect(resolveEnvironment({ NODE_ENV: 'development' }).appEnv).toBe('development');
    });

    it('derives stripeMode from key prefix without exposing the key', () => {
      expect(
        resolveEnvironment({ STRIPE_SECRET_KEY: 'sk_test_abc123' }).stripeMode,
      ).toBe('test');
      expect(
        resolveEnvironment({ STRIPE_SECRET_KEY: 'sk_live_abc123' }).stripeMode,
      ).toBe('live');
    });

    it('defaults providerMode to live and respects mock', () => {
      expect(resolveEnvironment({}).providerMode).toBe('live');
      expect(resolveEnvironment({ PROVIDER_MODE: 'mock' }).providerMode).toBe('mock');
    });

    it('never contains secret values in the fingerprint', () => {
      const fp = resolveEnvironment({
        APP_ENVIRONMENT: 'preview',
        SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
        SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role',
        STRIPE_SECRET_KEY: 'sk_live_secretvalue',
      });
      const serialized = JSON.stringify(fp);
      expect(serialized).not.toContain('super-secret-service-role');
      expect(serialized).not.toContain('sk_live_secretvalue');
    });
  });

  describe('deriveSupabaseRefFromUrl', () => {
    it('extracts the ref from a supabase.co host', () => {
      expect(deriveSupabaseRefFromUrl(`https://${PROD_SUPABASE_REF}.supabase.co`)).toBe(PROD_SUPABASE_REF);
    });
    it('returns null for non-supabase or malformed urls', () => {
      expect(deriveSupabaseRefFromUrl('https://example.com')).toBeNull();
      expect(deriveSupabaseRefFromUrl('not-a-url')).toBeNull();
      expect(deriveSupabaseRefFromUrl(undefined)).toBeNull();
    });
  });

  describe('checkEnvironmentConsistency', () => {
    const fp = (over: Partial<EnvFingerprint>): EnvFingerprint => ({
      appEnv: 'production',
      supabaseRef: PROD_SUPABASE_REF,
      stripeMode: 'test',
      providerMode: 'live',
      ...over,
    });

    it('preview + prod ref → NONPROD_USES_PROD_SUPABASE', () => {
      expect(codes(checkEnvironmentConsistency(fp({ appEnv: 'preview' })))).toContain(
        'NONPROD_USES_PROD_SUPABASE',
      );
    });

    it('development + prod ref → NONPROD_USES_PROD_SUPABASE', () => {
      expect(codes(checkEnvironmentConsistency(fp({ appEnv: 'development' })))).toContain(
        'NONPROD_USES_PROD_SUPABASE',
      );
    });

    it('production + prod ref → clean', () => {
      expect(checkEnvironmentConsistency(fp({}))).toEqual([]);
    });

    it('production + other ref → PROD_USES_NONPROD_SUPABASE', () => {
      expect(codes(checkEnvironmentConsistency(fp({ supabaseRef: OTHER_REF })))).toContain(
        'PROD_USES_NONPROD_SUPABASE',
      );
    });

    it('preview + sk_live → STAGING_USES_LIVE_STRIPE', () => {
      const v = checkEnvironmentConsistency(
        fp({ appEnv: 'preview', supabaseRef: OTHER_REF, stripeMode: 'live' }),
      );
      expect(codes(v)).toContain('STAGING_USES_LIVE_STRIPE');
    });

    it('missing ref → MISSING_SUPABASE_REF', () => {
      expect(codes(checkEnvironmentConsistency(fp({ supabaseRef: null })))).toContain(
        'MISSING_SUPABASE_REF',
      );
    });

    it('violation messages contain no secret VALUES (key material)', () => {
      const v = checkEnvironmentConsistency(fp({ appEnv: 'preview' }));
      for (const item of v) {
        // No Stripe key material, no JWT-looking service-role token.
        expect(item.message).not.toMatch(/sk_(test|live)_/);
        expect(item.message).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
      }
    });
  });

  describe('assertEnvironmentConsistency modes', () => {
    it('shadow mode warns but never throws on a violation', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = {
        ENV_ISOLATION_MODE: 'shadow',
        APP_ENVIRONMENT: 'preview',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
      };
      let result;
      expect(() => {
        result = assertEnvironmentConsistency(env);
      }).not.toThrow();
      expect(codes(result!)).toContain('NONPROD_USES_PROD_SUPABASE');
      expect(warn).toHaveBeenCalled();
      const logged = JSON.parse((warn.mock.calls[0][0] as string));
      expect(logged.event).toBe('env_isolation_violation');
      expect(logged.violation_code).toBe('NONPROD_USES_PROD_SUPABASE');
      expect(logged.supabaseRef_present).toBe(true);
      // PII-free: no secret in the structured event.
      expect(JSON.stringify(logged)).not.toContain(PROD_SUPABASE_REF);
    });

    it('shadow mode is default when ENV_ISOLATION_MODE unset', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = {
        APP_ENVIRONMENT: 'preview',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
      };
      expect(() => assertEnvironmentConsistency(env)).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });

    it('enforce mode throws EnvironmentIsolationError with violation codes', () => {
      const env = {
        ENV_ISOLATION_MODE: 'enforce',
        APP_ENVIRONMENT: 'preview',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
      };
      try {
        assertEnvironmentConsistency(env);
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(EnvironmentIsolationError);
        expect((e as EnvironmentIsolationError).violationCodes).toContain('NONPROD_USES_PROD_SUPABASE');
      }
    });

    it('off mode is a no-op (no warn, no throw, empty result)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = {
        ENV_ISOLATION_MODE: 'off',
        APP_ENVIRONMENT: 'preview',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
      };
      const result = assertEnvironmentConsistency(env);
      expect(result).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('clean prod config produces no warn and no throw in shadow', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = {
        ENV_ISOLATION_MODE: 'shadow',
        APP_ENVIRONMENT: 'production',
        SUPABASE_PROJECT_REF: PROD_SUPABASE_REF,
        STRIPE_MODE: 'live',
      };
      expect(assertEnvironmentConsistency(env)).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
