/**
 * Google Cloud Vision — DOCUMENT_TEXT_DETECTION provider
 *
 * Supports two auth modes (in priority order):
 *   1. Service account JSON (preferred for Vercel/serverless):
 *        GOOGLE_VISION_SERVICE_ACCOUNT_JSON
 *        GOOGLE_CLOUD_CREDENTIALS
 *        GOOGLE_APPLICATION_CREDENTIALS_JSON
 *   2. API key (legacy, simpler setup):
 *        GOOGLE_CLOUD_VISION_API_KEY  |  GOOGLE_VISION_API_KEY
 *
 * Uses the REST API (no heavy SDK) with Bearer token (SA) or ?key= (API key).
 * Returns every word with a stable ID (w_NNNN) and a normalised bbox.
 *
 * If no credentials found → returns OcrBlockedResult (not an error) so the
 * route can surface a 503 with actionable guidance.
 *
 * Do NOT log the API key or private_key. Do NOT expose raw response to client.
 */
import { GoogleAuth } from 'google-auth-library'
import type { OcrProvider, OcrResult, OcrBlockedResult, OcrProviderErrorResult, OcrWord, OcrLine, OcrPage, OcrBoundingBox } from '../types'
import { loadVisionCredentials } from '@/lib/canonical/vision/visionCredentials'
import { withOcrCostMetrics, computeCacheKeySha, sha256Hex, estCostUsdMicros } from '@/lib/v1/ocrCostMetrics'
import { classifyProviderError, extractGoogleRpcStatus } from '../ocrErrors'

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'
const VISION_TIMEOUT_MS = 12_000   // Google Vision: typically 1–5s; 12s safety margin
const PROVIDER_NAME = 'google_vision'
// Stable shadow-cache-key dims for this provider call shape. Bump when the
// request shape (features/languageHints) or any preprocessing changes, so the
// would-be cache-hit analysis never reuses a key across a behaviour change.
const VISION_MODEL = 'document_text_detection'
const VISION_PROMPT_VERSION = 'v1'      // request shape: DOCUMENT_TEXT_DETECTION, hints uk/en/ru
const VISION_PREPROC_VERSION = 'v1'

// ── Google Vision response shapes ────────────────────────────────────────────

interface GVertex { x?: number; y?: number }
interface GBoundingPoly { vertices: GVertex[] }

interface GSymbol {
  text: string
  confidence?: number
  boundingBox?: GBoundingPoly
}

interface GWord {
  symbols: GSymbol[]
  confidence?: number
  boundingBox?: GBoundingPoly
}

interface GParagraph {
  words: GWord[]
  confidence?: number
  boundingBox?: GBoundingPoly
}

interface GBlock {
  paragraphs: GParagraph[]
  confidence?: number
  boundingBox?: GBoundingPoly
}

interface GPageLayout {
  width: number
  height: number
  blocks: GBlock[]
}

interface GFullTextAnnotation {
  text: string
  pages: GPageLayout[]
}

interface GAnnotateResponse {
  fullTextAnnotation?: GFullTextAnnotation
  error?: { code: number; message: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verticesToBbox(vertices: GVertex[], pageW: number, pageH: number): OcrBoundingBox {
  if (!vertices || vertices.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  const xs = vertices.map(v => v.x ?? 0)
  const ys = vertices.map(v => v.y ?? 0)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys)
  const safeW = pageW > 0 ? pageW : 1
  const safeH = pageH > 0 ? pageH : 1
  return {
    x: x0 / safeW,
    y: y0 / safeH,
    width:  (x1 - x0) / safeW,
    height: (y1 - y0) / safeH,
  }
}

function wordText(gw: GWord): string {
  return (gw.symbols ?? []).map(s => s.text ?? '').join('')
}

// ── Provider implementation ───────────────────────────────────────────────────

// ── GoogleAuth singleton for service account mode ──────────────────────────
// Lazily instantiated; reset if credentials change between test runs.
let _googleAuth: GoogleAuth | null = null

function getGoogleAuth(credentials: Record<string, unknown>): GoogleAuth {
  if (!_googleAuth) {
    _googleAuth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
  }
  return _googleAuth
}

export const googleVisionProvider: OcrProvider = {
  async extractText({ imageBuffer, mimeType }): Promise<OcrResult | OcrBlockedResult | OcrProviderErrorResult> {
    // ── Resolve credentials ──────────────────────────────────────────────────
    const { credentials, apiKey, status } = loadVisionCredentials()

    if (!status.present) {
      console.error('[google-vision] No credentials found:', status.error)
      return {
        blocked: true,
        reason:
          'Google Cloud Vision credentials are not configured. ' +
          'Add GOOGLE_VISION_SERVICE_ACCOUNT_JSON (service account JSON) or ' +
          'GOOGLE_CLOUD_VISION_API_KEY (API key) to your environment variables.',
        required_env_vars: [
          'GOOGLE_VISION_SERVICE_ACCOUNT_JSON',
          'GOOGLE_CLOUD_VISION_API_KEY',
        ],
      }
    }

    if (!credentials && !apiKey) {
      // Should not happen after status.present=true, but guard defensively
      console.error('[google-vision] Credentials status present but both credentials and apiKey are null:', status.error)
      return {
        blocked: true,
        reason: `Google Cloud Vision credentials error: ${status.error ?? 'UNKNOWN'}`,
        required_env_vars: ['GOOGLE_VISION_SERVICE_ACCOUNT_JSON'],
      }
    }

    const startMs = Date.now()
    const imageBase64 = imageBuffer.toString('base64')

    const requestBody = {
      requests: [{
        image: { content: imageBase64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        imageContext: {
          languageHints: ['uk', 'en', 'ru'],  // Ukrainian, English, Russian
        },
      }],
    }

    // ── Build fetch URL and headers based on auth method ────────────────────
    let fetchUrl: string
    let fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

    if (credentials) {
      // Service account: get Bearer token via google-auth-library
      try {
        const auth = getGoogleAuth(credentials as Record<string, unknown>)
        const client = await auth.getClient()
        const tokenRes = await client.getAccessToken()
        const token = tokenRes.token
        if (!token) {
          console.error('[google-vision] Service account token acquisition returned empty token')
          return buildEmptyResult(Date.now() - startMs, ['VISION_SA_TOKEN_EMPTY'])
        }
        fetchUrl = VISION_API_URL
        fetchHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        console.info('[google-vision] Auth: service_account, project:', status.project_id, 'sa:', status.client_email_masked)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[google-vision] Service account token error:', msg.slice(0, 200))
        return buildEmptyResult(Date.now() - startMs, [`VISION_SA_AUTH_ERROR: ${msg.slice(0, 100)}`])
      }
    } else {
      // API key: append to URL
      fetchUrl = `${VISION_API_URL}?key=${apiKey}`
    }

    // SHADOW cost metric: time + emit the external Vision call (PII-free). The
    // wrapper returns the fetch result UNCHANGED — output is byte-identical.
    // requestSha binds the response-affecting request CONFIG (features + language
    // hints) — NOT the image (already in fileSha256). Currently constant, but this
    // makes a future hint/feature change discriminate the key without a manual
    // version bump, so different configs never collapse onto one dedup result.
    const requestSha = sha256Hex(
      JSON.stringify(requestBody.requests[0].features) +
        JSON.stringify(requestBody.requests[0].imageContext),
    )
    const cacheKeySha = computeCacheKeySha({
      fileSha256: sha256Hex(imageBuffer),
      provider: PROVIDER_NAME,
      model: VISION_MODEL,
      promptVersion: VISION_PROMPT_VERSION,
      preprocVersion: VISION_PREPROC_VERSION,
      requestSha,
    })
    let gResponse: GAnnotateResponse
    try {
      const res = await withOcrCostMetrics(
        {
          product: 'ocr', route: 'provider:google_vision', provider: PROVIDER_NAME,
          model: VISION_MODEL, cacheKeySha,
          est_cost_usd_micros: estCostUsdMicros(PROVIDER_NAME, VISION_MODEL),
          // Gateway (cache/dedup/budget) — no-op pass-through until a flag is ON.
          gateway: {
            fileSha256: sha256Hex(imageBuffer),
            promptVersion: VISION_PROMPT_VERSION,
            preprocVersion: VISION_PREPROC_VERSION,
            requestSha,
          },
        },
        () => fetch(fetchUrl, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        }),
      )

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        // Do NOT log errBody verbatim — may contain key reflection. Parse it
        // ONLY to read the Google RPC status/reason for classification.
        let parsed: unknown
        try { parsed = errBody ? JSON.parse(errBody) : undefined } catch { parsed = undefined }
        const rpc = extractGoogleRpcStatus(parsed)
        const error = classifyProviderError(res.status, rpc, {
          retryAfterHeader: res.headers.get('retry-after'),
        })
        // HONEST DEGRADATION (P1): a provider HTTP failure (429 rate-limit, 5xx,
        // 403 billing) is NO LONGER flattened into an empty success. We carry the
        // typed error up so the route returns an honest non-2xx — never 200+[].
        console.error(`[google-vision] HTTP ${res.status} → ${error.error_code} (redacted body)`)
        return { provider_error: true, error }
      }

      const data = await res.json() as { responses?: GAnnotateResponse[] }
      gResponse = data.responses?.[0] ?? {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || /timeout|aborted/i.test(msg))
      // Timeout / network = provider unavailable (retryable), NOT empty success.
      const error = classifyProviderError(0, undefined, { timeout: isTimeout, marker: isTimeout ? 'timeout' : 'network' })
      console.error(`[google-vision] fetch failed → ${error.error_code}:`, msg.slice(0, 120))
      return { provider_error: true, error }
    }

    if (gResponse.error) {
      // 200 envelope carrying an inline error (Google sometimes returns 200 with
      // responses[0].error). Classify by its code/status — NOT an empty success.
      // gResponse.error.code is a Google RPC code (8=RESOURCE_EXHAUSTED), NOT an
      // HTTP status — pass httpStatus 0 and let the message/marker keyword route it.
      const error = classifyProviderError(0, { code: gResponse.error.code, message: gResponse.error.message }, { marker: gResponse.error.message })
      console.error(`[google-vision] inline API error ${gResponse.error.code} → ${error.error_code}`)
      return { provider_error: true, error }
    }

    const fta = gResponse.fullTextAnnotation
    if (!fta) {
      return buildEmptyResult(Date.now() - startMs, ['No text detected in image'])
    }

    // ── Parse pages → lines → words with stable IDs ──────────────────────────
    const allPages: OcrPage[] = []
    const allLines: OcrLine[] = []
    const allWords: OcrWord[] = []

    let wordCounter = 0
    let lineCounter = 0

    for (let pi = 0; pi < fta.pages.length; pi++) {
      const gPage = fta.pages[pi]
      const pageNum = pi + 1
      const pageW = gPage.width ?? 1
      const pageH = gPage.height ?? 1

      const pageWords: OcrWord[] = []
      const pageLines: OcrLine[] = []

      for (const gBlock of (gPage.blocks ?? [])) {
        for (const gPara of (gBlock.paragraphs ?? [])) {
          // Treat each paragraph as a line
          const lineId = `l_${String(lineCounter).padStart(4, '0')}`
          lineCounter++

          const lineWords: OcrWord[] = []
          let lineText = ''

          for (const gWord of (gPara.words ?? [])) {
            const text = wordText(gWord)
            if (!text) continue

            const wordId = `w_${String(wordCounter).padStart(4, '0')}`
            wordCounter++

            const bbox = gWord.boundingBox
              ? verticesToBbox(gWord.boundingBox.vertices, pageW, pageH)
              : { x: 0, y: 0, width: 1, height: 1 }

            const word: OcrWord = {
              id: wordId,
              text,
              page: pageNum,
              bbox,
              confidence: gWord.confidence,
              source: PROVIDER_NAME,
            }

            lineWords.push(word)
            pageWords.push(word)
            allWords.push(word)
            lineText += (lineText ? ' ' : '') + text
          }

          if (lineWords.length === 0) continue

          // Line bbox = union of word bboxes
          const lx0 = Math.min(...lineWords.map(w => w.bbox.x))
          const ly0 = Math.min(...lineWords.map(w => w.bbox.y))
          const lx1 = Math.max(...lineWords.map(w => w.bbox.x + w.bbox.width))
          const ly1 = Math.max(...lineWords.map(w => w.bbox.y + w.bbox.height))
          const lineBbox: OcrBoundingBox = { x: lx0, y: ly0, width: lx1 - lx0, height: ly1 - ly0 }

          const avgConf = lineWords.reduce((s, w) => s + (w.confidence ?? 0.9), 0) / lineWords.length

          const line: OcrLine = {
            id: lineId,
            text: lineText,
            page: pageNum,
            bbox: lineBbox,
            words: lineWords,
            confidence: avgConf,
            source: PROVIDER_NAME,
          }

          pageLines.push(line)
          allLines.push(line)
        }
      }

      allPages.push({
        page: pageNum,
        width: pageW,
        height: pageH,
        lines: pageLines,
        words: pageWords,
      })
    }

    const processingMs = Date.now() - startMs

    return {
      provider: PROVIDER_NAME,
      raw_text: fta.text ?? '',
      pages: allPages,
      lines: allLines,
      words: allWords,
      processing_ms: processingMs,
      warnings: [],
      created_at: new Date().toISOString(),
    }
  },
}

function buildEmptyResult(processingMs: number, warnings: string[]): OcrResult {
  return {
    provider: PROVIDER_NAME,
    raw_text: '',
    pages: [],
    lines: [],
    words: [],
    processing_ms: processingMs,
    warnings,
    created_at: new Date().toISOString(),
  }
}
