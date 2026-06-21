/**
 * visionCredentials.test.ts — Tests for the Vision credentials loader.
 *
 * Covers:
 *   - reads GOOGLE_VISION_SERVICE_ACCOUNT_JSON (highest priority)
 *   - reads GOOGLE_CLOUD_CREDENTIALS as fallback
 *   - reads GOOGLE_APPLICATION_CREDENTIALS_JSON as fallback
 *   - priority order (first env var wins)
 *   - normalizes private_key \\n → real newline (Vercel escaping fix)
 *   - rejects invalid JSON
 *   - rejects JSON missing required fields
 *   - masks client_email in status
 *   - never includes private_key in status
 *   - falls back to API key when no JSON env set
 *   - returns VISION_CREDENTIALS_MISSING when nothing set
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadVisionCredentials } from '../visionCredentials'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA...\\n-----END RSA PRIVATE KEY-----'
const FAKE_PRIVATE_KEY_REAL_NEWLINES = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'

const VALID_SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project-123',
  private_key_id: 'key123',
  private_key: FAKE_PRIVATE_KEY,
  client_email: 'vision-sa@test-project-123.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
})

const VALID_SA_OBJ = JSON.parse(VALID_SA_JSON)

// ── Helpers ───────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key]
    if (vars[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = vars[key]
    }
  }
  try {
    fn()
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[key]
      }
    }
  }
}

// Clear all Vision-related env vars before each test
const ALL_VISION_VARS = [
  'GOOGLE_VISION_SERVICE_ACCOUNT_JSON',
  'GOOGLE_CLOUD_CREDENTIALS',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_CLOUD_VISION_API_KEY',
  'GOOGLE_VISION_API_KEY',
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('loadVisionCredentials()', () => {
  let savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Save and clear all Vision env vars
    for (const v of ALL_VISION_VARS) {
      savedEnv[v] = process.env[v]
      delete process.env[v]
    }
  })

  afterEach(() => {
    // Restore saved env
    for (const v of ALL_VISION_VARS) {
      if (savedEnv[v] === undefined) {
        delete process.env[v]
      } else {
        process.env[v] = savedEnv[v]
      }
    }
    savedEnv = {}
  })

  // ── Service account JSON env vars ──────────────────────────────────────────

  it('reads GOOGLE_VISION_SERVICE_ACCOUNT_JSON', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = VALID_SA_JSON
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).not.toBeNull()
    expect(apiKey).toBeNull()
    expect(status.present).toBe(true)
    expect(status.source).toBe('GOOGLE_VISION_SERVICE_ACCOUNT_JSON')
    expect(status.auth_method).toBe('service_account_json')
    expect(status.project_id).toBe('test-project-123')
    expect(status.error).toBeNull()
  })

  it('reads GOOGLE_CLOUD_CREDENTIALS as fallback when primary not set', () => {
    process.env.GOOGLE_CLOUD_CREDENTIALS = VALID_SA_JSON
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).not.toBeNull()
    expect(apiKey).toBeNull()
    expect(status.source).toBe('GOOGLE_CLOUD_CREDENTIALS')
    expect(status.auth_method).toBe('service_account_json')
  })

  it('reads GOOGLE_APPLICATION_CREDENTIALS_JSON as fallback when first two not set', () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA_JSON
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).not.toBeNull()
    expect(apiKey).toBeNull()
    expect(status.source).toBe('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    expect(status.auth_method).toBe('service_account_json')
  })

  it('uses GOOGLE_VISION_SERVICE_ACCOUNT_JSON over GOOGLE_CLOUD_CREDENTIALS (priority order)', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = VALID_SA_JSON
    process.env.GOOGLE_CLOUD_CREDENTIALS = JSON.stringify({ ...VALID_SA_OBJ, project_id: 'wrong-project' })
    const { status } = loadVisionCredentials()

    expect(status.source).toBe('GOOGLE_VISION_SERVICE_ACCOUNT_JSON')
    expect(status.project_id).toBe('test-project-123')
  })

  // ── private_key normalization ──────────────────────────────────────────────

  it('normalizes private_key \\\\n to real newline (Vercel escaping fix)', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = VALID_SA_JSON // has \\n in private_key
    const { credentials } = loadVisionCredentials()

    expect(credentials).not.toBeNull()
    // After normalization, must have real newlines
    expect(credentials!.private_key).toContain('\n')
    expect(credentials!.private_key).not.toContain('\\n')
  })

  // ── client_email masking ──────────────────────────────────────────────────

  it('masks client_email in status (hides project info after @)', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = VALID_SA_JSON
    const { status } = loadVisionCredentials()

    expect(status.client_email_masked).toBe('vision-sa@***.iam.gserviceaccount.com')
    // Must not contain the real project name
    expect(status.client_email_masked).not.toContain('test-project-123')
  })

  it('never includes private_key in status', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = VALID_SA_JSON
    const { status } = loadVisionCredentials()

    const statusStr = JSON.stringify(status)
    expect(statusStr).not.toContain('BEGIN RSA')
    expect(statusStr).not.toContain('private_key')
    expect(statusStr).not.toContain('MIIEow')
  })

  // ── JSON validation errors ─────────────────────────────────────────────────

  it('rejects invalid JSON with VISION_CREDENTIALS_INVALID_JSON', () => {
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = 'not-valid-json{'
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).toBeNull()
    expect(apiKey).toBeNull()
    expect(status.present).toBe(false)
    expect(status.error).toBe('VISION_CREDENTIALS_INVALID_JSON')
    expect(status.source).toBe('GOOGLE_VISION_SERVICE_ACCOUNT_JSON')
  })

  it('rejects JSON missing required fields (type, project_id, client_email, private_key)', () => {
    const incomplete = JSON.stringify({ type: 'service_account', project_id: 'p' })
    process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON = incomplete
    const { credentials, status } = loadVisionCredentials()

    expect(credentials).toBeNull()
    expect(status.error).toMatch(/^VISION_CREDENTIALS_MISSING_FIELDS:/)
    expect(status.error).toContain('client_email')
    expect(status.error).toContain('private_key')
  })

  // ── API key fallback ───────────────────────────────────────────────────────

  it('falls back to GOOGLE_CLOUD_VISION_API_KEY when no JSON env set', () => {
    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'REDACTED_GOOGLE_API_KEY_DO_NOT_USE'
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).toBeNull()
    expect(apiKey).toBe('REDACTED_GOOGLE_API_KEY_DO_NOT_USE')
    expect(status.present).toBe(true)
    expect(status.auth_method).toBe('api_key')
    expect(status.source).toBe('GOOGLE_CLOUD_VISION_API_KEY')
    expect(status.error).toBeNull()
  })

  it('falls back to GOOGLE_VISION_API_KEY when GOOGLE_CLOUD_VISION_API_KEY not set', () => {
    process.env.GOOGLE_VISION_API_KEY = 'REDACTED_GOOGLE_API_KEY_DO_NOT_USE'
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).toBeNull()
    expect(apiKey).toBe('REDACTED_GOOGLE_API_KEY_DO_NOT_USE')
    expect(status.auth_method).toBe('api_key')
    expect(status.source).toBe('GOOGLE_VISION_API_KEY')
  })

  // ── Nothing set ────────────────────────────────────────────────────────────

  it('returns VISION_CREDENTIALS_MISSING when no env var set', () => {
    const { credentials, apiKey, status } = loadVisionCredentials()

    expect(credentials).toBeNull()
    expect(apiKey).toBeNull()
    expect(status.present).toBe(false)
    expect(status.error).toBe('VISION_CREDENTIALS_MISSING')
    expect(status.auth_method).toBeNull()
    expect(status.source).toBeNull()
  })
})
