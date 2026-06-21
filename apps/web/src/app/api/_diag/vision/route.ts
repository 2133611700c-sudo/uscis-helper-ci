/**
 * GET /api/_diag/vision
 *
 * Internal diagnostic endpoint for Google Vision API credentials.
 * Protected by INTERNAL_DIAG_TOKEN header: X-Internal-Diag-Token.
 *
 * Returns sanitized status — NO PII, NO private_key, NO raw credentials.
 * Uses a tiny synthetic test image (1x1 white PNG) to verify live API connectivity.
 *
 * Usage:
 *   curl -H "X-Internal-Diag-Token: <token>" https://messenginfo.com/api/_diag/vision
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadVisionCredentials } from '@/lib/canonical/vision/visionCredentials'
import { GoogleAuth } from 'google-auth-library'

// ── Minimal 1x1 white PNG (base64) — no PII, no real document ───────────────
// Generated offline: python3 -c "import base64,struct,zlib; ..."
// This is a valid 1×1 white PNG (68 bytes decoded)
const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=='

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'
const VISION_TIMEOUT_MS = 10_000

interface GAnnotateResponse {
  textAnnotations?: Array<{ description?: string }>
  fullTextAnnotation?: { text?: string }
  error?: { code: number; message: string }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const tokenFromHeader = req.headers.get('x-internal-diag-token')
  const expectedToken = process.env.INTERNAL_DIAG_TOKEN

  if (!expectedToken || tokenFromHeader !== expectedToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Load credentials ──────────────────────────────────────────────────────
  const { credentials, apiKey, status } = loadVisionCredentials()

  if (!status.present) {
    return NextResponse.json(
      {
        vision_ok: false,
        credentials_present: false,
        error_code: status.error ?? 'VISION_CREDENTIALS_MISSING',
        project_id_detected: null,
        service_account_detected_masked: null,
        auth_method: null,
        text_detected_length: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  }

  // ── Build auth headers ────────────────────────────────────────────────────
  let fetchUrl: string
  let fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

  if (credentials) {
    try {
      const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      })
      const client = await auth.getClient()
      const tokenRes = await client.getAccessToken()
      const token = tokenRes.token
      if (!token) {
        return NextResponse.json(
          {
            vision_ok: false,
            credentials_present: true,
            error_code: 'VISION_SA_TOKEN_EMPTY',
            project_id_detected: status.project_id,
            service_account_detected_masked: status.client_email_masked,
            auth_method: status.auth_method,
            text_detected_length: 0,
            timestamp: new Date().toISOString(),
          },
          { status: 200 },
        )
      }
      fetchUrl = VISION_API_URL
      fetchHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).slice(0, 200)
      return NextResponse.json(
        {
          vision_ok: false,
          credentials_present: true,
          error_code: 'VISION_SA_TOKEN_ERROR',
          error_message_sanitized: msg,
          project_id_detected: status.project_id,
          service_account_detected_masked: status.client_email_masked,
          auth_method: status.auth_method,
          text_detected_length: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      )
    }
  } else if (apiKey) {
    fetchUrl = `${VISION_API_URL}?key=${apiKey}`
  } else {
    return NextResponse.json(
      {
        vision_ok: false,
        credentials_present: false,
        error_code: 'VISION_CREDENTIALS_MISSING',
        project_id_detected: null,
        service_account_detected_masked: null,
        auth_method: null,
        text_detected_length: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  }

  // ── Call Vision API with tiny test image ─────────────────────────────────
  try {
    const requestBody = {
      requests: [
        {
          image: { content: TEST_IMAGE_BASE64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        },
      ],
    }

    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const errorCode =
        res.status === 403
          ? 'VISION_AUTH_403'
          : res.status === 401
            ? 'VISION_AUTH_401'
            : res.status === 429
              ? 'VISION_QUOTA_EXCEEDED'
              : `VISION_HTTP_${res.status}`

      const sanitizedError = errText
        .replace(/"key":\s*"[^"]*"/g, '"key":"[redacted]"')
        .slice(0, 300)

      return NextResponse.json(
        {
          vision_ok: false,
          credentials_present: true,
          error_code: errorCode,
          error_message_sanitized: sanitizedError,
          project_id_detected: status.project_id,
          service_account_detected_masked: status.client_email_masked,
          auth_method: status.auth_method,
          text_detected_length: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      )
    }

    const data = (await res.json()) as { responses?: GAnnotateResponse[] }
    const gResponse: GAnnotateResponse = data.responses?.[0] ?? {}

    if (gResponse.error) {
      const errorCode =
        gResponse.error.code === 403
          ? 'VISION_AUTH_403'
          : gResponse.error.message?.includes('billing')
            ? 'VISION_BILLING_OR_QUOTA'
            : gResponse.error.message?.includes('API') || gResponse.error.message?.includes('disabled')
              ? 'VISION_API_DISABLED_OR_PERMISSION_DENIED'
              : `VISION_API_ERROR_${gResponse.error.code}`

      return NextResponse.json(
        {
          vision_ok: false,
          credentials_present: true,
          error_code: errorCode,
          error_message_sanitized: gResponse.error.message.slice(0, 200),
          project_id_detected: status.project_id,
          service_account_detected_masked: status.client_email_masked,
          auth_method: status.auth_method,
          text_detected_length: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      )
    }

    // 1x1 white PNG likely returns no text — that's OK; success = no error
    const detectedText =
      gResponse.fullTextAnnotation?.text ??
      gResponse.textAnnotations?.[0]?.description ??
      ''

    return NextResponse.json(
      {
        vision_ok: true,
        credentials_present: true,
        project_id_detected: status.project_id,
        service_account_detected_masked: status.client_email_masked,
        auth_method: status.auth_method,
        text_detected_length: detectedText.length,
        text_detected_sample: detectedText.slice(0, 20),
        provider: 'google_vision',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (err: unknown) {
    const msg = String(err instanceof Error ? err.message : err).slice(0, 200)
    const errorCode = msg.includes('403')
      ? 'VISION_AUTH_403'
      : msg.includes('PERMISSION_DENIED')
        ? 'VISION_API_DISABLED_OR_PERMISSION_DENIED'
        : msg.includes('billing')
          ? 'VISION_BILLING_OR_QUOTA'
          : msg.includes('timeout') || msg.includes('abort')
            ? 'VISION_TIMEOUT'
            : 'VISION_UNKNOWN_ERROR'

    return NextResponse.json(
      {
        vision_ok: false,
        credentials_present: true,
        project_id_detected: status.project_id,
        service_account_detected_masked: status.client_email_masked,
        auth_method: status.auth_method,
        error_code: errorCode,
        error_message_sanitized: msg,
        text_detected_length: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  }
}
