/**
 * visionCredentials.ts — Robust credentials loader for Google Vision API
 *
 * Supports two auth modes:
 *   1. Service account JSON (preferred for Vercel/serverless)
 *      Priority order of env var names:
 *        a. GOOGLE_VISION_SERVICE_ACCOUNT_JSON
 *        b. GOOGLE_CLOUD_CREDENTIALS
 *        c. GOOGLE_APPLICATION_CREDENTIALS_JSON
 *   2. API Key fallback (GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_VISION_API_KEY)
 *
 * NEVER log private_key. NEVER expose raw credentials outside this module.
 * client_email is masked in status for diagnostics only.
 */

export interface VisionCredentialStatus {
  present: boolean
  source: string | null
  project_id: string | null
  client_email_masked: string | null // e.g. vision-sa@***.iam.gserviceaccount.com
  error: string | null
  auth_method: 'service_account_json' | 'api_key' | null
}

export interface ServiceAccountCredentials {
  type: string
  project_id: string
  client_email: string
  private_key: string
  [key: string]: unknown
}

export interface LoadVisionCredentialsResult {
  credentials: ServiceAccountCredentials | null
  apiKey: string | null
  status: VisionCredentialStatus
}

// Ordered list of env var names to check for service account JSON
const JSON_ENV_NAMES = [
  'GOOGLE_VISION_SERVICE_ACCOUNT_JSON',
  'GOOGLE_CLOUD_CREDENTIALS',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
] as const

const REQUIRED_SA_FIELDS = ['type', 'project_id', 'client_email', 'private_key'] as const

function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx === -1) return '***@***.iam.gserviceaccount.com'
  const localPart = email.slice(0, atIdx)
  return `${localPart}@***.iam.gserviceaccount.com`
}

/**
 * Load Vision API credentials.
 *
 * Priority:
 *   1. Service account JSON from env (supports Vercel serverless)
 *   2. API key from env (legacy, simpler setup)
 *
 * Returns credentials object (for google-auth-library) or apiKey (for REST),
 * plus a sanitized status for diagnostics — private_key is NEVER in status.
 */
export function loadVisionCredentials(): LoadVisionCredentialsResult {
  // ── Phase 1: Try service account JSON env vars (priority order) ────────────
  for (const envName of JSON_ENV_NAMES) {
    const raw = process.env[envName]
    if (!raw) continue

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {
        credentials: null,
        apiKey: null,
        status: {
          present: false,
          source: envName,
          project_id: null,
          client_email_masked: null,
          error: 'VISION_CREDENTIALS_INVALID_JSON',
          auth_method: null,
        },
      }
    }

    // Validate required fields
    const missing = REQUIRED_SA_FIELDS.filter((f) => !parsed[f])
    if (missing.length > 0) {
      return {
        credentials: null,
        apiKey: null,
        status: {
          present: false,
          source: envName,
          project_id: (parsed.project_id as string) ?? null,
          client_email_masked: null,
          error: `VISION_CREDENTIALS_MISSING_FIELDS:${missing.join(',')}`,
          auth_method: null,
        },
      }
    }

    // Normalize private_key newlines (Vercel escapes \n as \\n in env vars)
    const normalizedKey = (parsed.private_key as string).replace(/\\n/g, '\n')

    const credentials: ServiceAccountCredentials = {
      ...(parsed as ServiceAccountCredentials),
      private_key: normalizedKey,
    }

    return {
      credentials,
      apiKey: null,
      status: {
        present: true,
        source: envName,
        project_id: credentials.project_id,
        client_email_masked: maskEmail(credentials.client_email),
        error: null,
        auth_method: 'service_account_json',
      },
    }
  }

  // ── Phase 2: Try API key env vars (legacy) ─────────────────────────────────
  const apiKey =
    process.env.GOOGLE_CLOUD_VISION_API_KEY || process.env.GOOGLE_VISION_API_KEY || null

  if (apiKey) {
    return {
      credentials: null,
      apiKey,
      status: {
        present: true,
        source: apiKey === process.env.GOOGLE_CLOUD_VISION_API_KEY
          ? 'GOOGLE_CLOUD_VISION_API_KEY'
          : 'GOOGLE_VISION_API_KEY',
        project_id: null,
        client_email_masked: null,
        error: null,
        auth_method: 'api_key',
      },
    }
  }

  // ── Nothing found ──────────────────────────────────────────────────────────
  return {
    credentials: null,
    apiKey: null,
    status: {
      present: false,
      source: null,
      project_id: null,
      client_email_masked: null,
      error: 'VISION_CREDENTIALS_MISSING',
      auth_method: null,
    },
  }
}
