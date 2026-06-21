/**
 * Google Document AI Client — Messenginfo TPS
 *
 * Thin adapter for Google Document AI OCR processor.
 * Uses ADC (Application Default Credentials) via google-auth-library.
 * No heavy SDK — just REST API calls with proper auth.
 *
 * Credentials: service account JSON via GOOGLE_APPLICATION_CREDENTIALS
 * Processor: OCR_PROCESSOR at projects/537268475735/locations/us/processors/d207a62dc88ed12c
 */

import { GoogleAuth } from 'google-auth-library'
import { withOcrCostMetrics, computeCacheKeySha, sha256Hex, estCostUsdMicros } from '@/lib/v1/ocrCostMetrics'

const DOCAI_PROVIDER_NAME = 'google_docai'
const DOCAI_PROMPT_VERSION = 'v1'   // request shape: rawDocument OCR processor
const DOCAI_PREPROC_VERSION = 'v1'

// ── Config ─────────────────────────────────────────────────────────────────

export interface DocAIConfig {
  projectNumber: string
  location: string
  processorId: string
}

function getConfig(): DocAIConfig {
  return {
    projectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '537268475735',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us',
    processorId: process.env.DOCAI_PROCESSOR_ID || 'd207a62dc88ed12c',
  }
}

// ── Feature Flag ───────────────────────────────────────────────────────────

export function isDocAIEnabled(): boolean {
  return process.env.DOCAI_ENABLED === 'true' || process.env.DOCAI_ENABLED === '1'
}

// ── Auth ───────────────────────────────────────────────────────────────────

let authClient: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!authClient) {
    // Support TWO auth modes:
    // 1. GOOGLE_APPLICATION_CREDENTIALS (file path) — local dev
    // 2. GOOGLE_DOCAI_CREDENTIALS_JSON (JSON string) — Vercel production
    //    (serverless has no filesystem, can't read key file)
    const credsJson = process.env.GOOGLE_DOCAI_CREDENTIALS_JSON
    if (credsJson) {
      // Vercel: parse JSON from env var
      try {
        const credentials = JSON.parse(credsJson)
        authClient = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        })
      } catch {
        // Fall through to file-based auth
        authClient = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        })
      }
    } else {
      // Local: uses GOOGLE_APPLICATION_CREDENTIALS file path (ADC)
      authClient = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      })
    }
  }
  return authClient
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DocAIProcessResult {
  ok: true
  provider: 'google_docai'
  text: string
  pageCount: number
  textLength: number
  pages: DocAIPage[]
  mimeType: string
  processorId: string
  processingTimeMs: number
}

export interface DocAIPage {
  pageNumber: number
  width: number
  height: number
  lines: DocAILine[]
}

export interface DocAILine {
  text: string
  confidence: number
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export interface DocAIError {
  ok: false
  provider: 'google_docai'
  error: string
  errorCode: string
}

export type DocAIResult = DocAIProcessResult | DocAIError

// ── Main Process Function ──────────────────────────────────────────────────

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export async function processDocument(
  fileBytes: Buffer,
  mimeType: string,
): Promise<DocAIResult> {
  const startTime = Date.now()

  // Validate MIME
  if (!ALLOWED_MIMES.has(mimeType)) {
    return { ok: false, provider: 'google_docai', error: `Unsupported MIME: ${mimeType}`, errorCode: 'INVALID_MIME' }
  }

  // Validate size
  if (fileBytes.length > MAX_FILE_SIZE) {
    return { ok: false, provider: 'google_docai', error: `File too large: ${fileBytes.length}`, errorCode: 'FILE_TOO_LARGE' }
  }

  const config = getConfig()
  const endpoint = `https://${config.location}-documentai.googleapis.com/v1/projects/${config.projectNumber}/locations/${config.location}/processors/${config.processorId}:process`

  try {
    // Get auth token
    const auth = getAuth()
    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()
    const token = tokenResponse?.token
    if (!token) {
      return { ok: false, provider: 'google_docai', error: 'Failed to get access token', errorCode: 'AUTH_FAILED' }
    }

    // Build request
    const base64Content = fileBytes.toString('base64')
    const body = JSON.stringify({
      rawDocument: { mimeType, content: base64Content },
    })

    // SHADOW cost metric: time + emit the external DocAI call (PII-free). Result
    // is returned UNCHANGED — OCR output is byte-identical with/without this.
    // requestSha binds the response-affecting request descriptor (mimeType drives
    // how DocAI parses the bytes) — NOT the document bytes (already in fileSha256).
    const requestSha = sha256Hex(`docai:${mimeType}`)
    const cacheKeySha = computeCacheKeySha({
      fileSha256: sha256Hex(fileBytes),
      provider: DOCAI_PROVIDER_NAME,
      model: config.processorId,
      promptVersion: DOCAI_PROMPT_VERSION,
      preprocVersion: DOCAI_PREPROC_VERSION,
      requestSha,
    })
    // Call DocAI
    const response = await withOcrCostMetrics(
      {
        product: 'ocr', route: 'provider:google_docai', provider: DOCAI_PROVIDER_NAME,
        model: config.processorId, cacheKeySha,
        est_cost_usd_micros: estCostUsdMicros(DOCAI_PROVIDER_NAME),
        // Gateway (cache/dedup/budget) — no-op pass-through until a flag is ON.
        gateway: {
          fileSha256: sha256Hex(fileBytes),
          promptVersion: DOCAI_PROMPT_VERSION,
          preprocVersion: DOCAI_PREPROC_VERSION,
          requestSha,
        },
      },
      () => fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      }),
    )

    if (!response.ok) {
      const errBody = await response.text()
      const errCode = response.status === 403 ? 'PERMISSION_DENIED'
        : response.status === 400 ? 'INVALID_ARGUMENT'
        : response.status === 429 ? 'RESOURCE_EXHAUSTED'
        : response.status === 503 ? 'UNAVAILABLE'
        : `HTTP_${response.status}`
      return { ok: false, provider: 'google_docai', error: errBody.slice(0, 200), errorCode: errCode }
    }

    // Parse response
    const data = await response.json()
    const doc = data.document || data
    const text = doc.text || ''
    const pages: DocAIPage[] = (doc.pages || []).map((p: any, i: number) => ({
      pageNumber: i + 1,
      width: p.dimension?.width || 0,
      height: p.dimension?.height || 0,
      lines: extractLines(p, text),
    }))

    return {
      ok: true,
      provider: 'google_docai',
      text,
      pageCount: pages.length,
      textLength: text.length,
      pages,
      mimeType,
      processorId: config.processorId,
      processingTimeMs: Date.now() - startTime,
    }
  } catch (err: any) {
    return {
      ok: false,
      provider: 'google_docai',
      error: err.message || 'Unknown error',
      errorCode: 'INTERNAL_ERROR',
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractLines(page: any, fullText: string): DocAILine[] {
  const lines: DocAILine[] = []
  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || [paragraph]) {
        const segments = line.layout?.textAnchor?.textSegments || []
        let lineText = ''
        for (const seg of segments) {
          const start = parseInt(seg.startIndex || '0', 10)
          const end = parseInt(seg.endIndex || '0', 10)
          lineText += fullText.slice(start, end)
        }
        lines.push({
          text: lineText.trim(),
          confidence: line.layout?.confidence ?? 0,
        })
      }
    }
  }
  return lines
}

// ── Health Check ───────────────────────────────────────────────────────────

export async function checkDocAIHealth(): Promise<{
  configured: boolean
  enabled: boolean
  authWorks: boolean
  processorReachable: boolean
  error?: string
}> {
  const enabled = isDocAIEnabled()
  if (!enabled) return { configured: false, enabled: false, authWorks: false, processorReachable: false }

  try {
    const auth = getAuth()
    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()
    if (!tokenResponse?.token) {
      return { configured: true, enabled: true, authWorks: false, processorReachable: false, error: 'No token' }
    }

    const config = getConfig()
    const endpoint = `https://${config.location}-documentai.googleapis.com/v1/projects/${config.projectNumber}/locations/${config.location}/processors/${config.processorId}`
    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${tokenResponse.token}` },
    })

    return {
      configured: true,
      enabled: true,
      authWorks: true,
      processorReachable: res.ok,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (err: any) {
    return { configured: true, enabled: true, authWorks: false, processorReachable: false, error: err.message }
  }
}
