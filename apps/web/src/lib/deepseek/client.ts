/**
 * apps/web/src/lib/deepseek/client.ts
 *
 * Reusable DeepSeek client for use across API routes.
 * Wraps the @uscis-helper/ai package with a lower-level interface.
 *
 * Exports:
 *   chat()   — wrapper for deepseek-chat model
 *   reason() — wrapper for deepseek-reasoner (R1)
 *   DeepSeekError, isDeepSeekError, ChatMessage, ChatOptions, ChatResult
 */

import { withOcrCostMetrics, computeCacheKeySha, sha256Hex, estCostUsdMicros } from '@/lib/v1/ocrCostMetrics'

export { generateMiaAnswer } from '@uscis-helper/ai'
export type { MiaInput, MiaOutput } from '@uscis-helper/ai'

const DEEPSEEK_PROVIDER_NAME = 'deepseek'
const DEEPSEEK_PROMPT_VERSION = 'v1'   // request shape: chat/completions JSON
const DEEPSEEK_PREPROC_VERSION = 'v1'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

export interface ChatResult {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'DeepSeekError'
  }
}

export function isDeepSeekError(e: unknown, code?: string): e is DeepSeekError {
  if (!(e instanceof DeepSeekError)) return false
  if (code !== undefined) return e.code === code
  return true
}

// ─── Default timeout ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000

// ─── Low-level fetch wrapper ──────────────────────────────────────────────────

async function deepseekFetch(
  messages: ChatMessage[],
  model: string,
  options: ChatOptions
): Promise<ChatResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'

  if (!apiKey) {
    throw new DeepSeekError('DEEPSEEK_API_KEY not configured', 'NOT_CONFIGURED', 503)
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // SHADOW cost metric: hash the request payload (PII never logged — only the
  // sha) and time + emit the external DeepSeek call. Result returned UNCHANGED.
  const cacheKeySha = computeCacheKeySha({
    fileSha256: sha256Hex(JSON.stringify(messages)),
    provider: DEEPSEEK_PROVIDER_NAME,
    model,
    promptVersion: DEEPSEEK_PROMPT_VERSION,
    preprocVersion: DEEPSEEK_PREPROC_VERSION,
  })
  try {
    const res = await withOcrCostMetrics(
      {
        product: 'ocr', route: 'provider:deepseek_chat', provider: DEEPSEEK_PROVIDER_NAME,
        model, cacheKeySha, est_cost_usd_micros: estCostUsdMicros(DEEPSEEK_PROVIDER_NAME, model),
        // Gateway (cache/dedup/budget) — no-op pass-through until a flag is ON.
        gateway: {
          fileSha256: sha256Hex(JSON.stringify(messages)),
          promptVersion: DEEPSEEK_PROMPT_VERSION,
          preprocVersion: DEEPSEEK_PREPROC_VERSION,
        },
      },
      () => fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 200,
          temperature: options.temperature ?? 0.3,
          messages,
        }),
        signal: controller.signal,
      }),
    )

    if (!res.ok) {
      throw new DeepSeekError(
        `DeepSeek API error: HTTP ${res.status}`,
        'HTTP_ERROR',
        res.status
      )
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      model?: string
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    const content =
      data.choices?.[0]?.message?.content ??
      'No content returned. Please check uscis.gov directly.'

    return {
      content,
      model: data.model ?? model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  } catch (e: unknown) {
    if (e instanceof DeepSeekError) throw e
    if (e instanceof Error && e.name === 'AbortError') {
      throw new DeepSeekError(`DeepSeek request timed out after ${timeoutMs}ms`, 'TIMEOUT', 504)
    }
    // NEVER log apiKey or secrets
    const msg = e instanceof Error ? e.message : String(e)
    throw new DeepSeekError(`DeepSeek chat error: ${msg}`, 'UNKNOWN', 500)
  } finally {
    clearTimeout(timer)
  }
}

// ─── chat() — deepseek-chat ───────────────────────────────────────────────────

/**
 * Fast, cost-effective model. Use for FAQ responses and info summaries.
 */
export function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
  return deepseekFetch(messages, model, options)
}

// ─── reason() — deepseek-reasoner (R1) ────────────────────────────────────────

/**
 * Reasoning model. Use for complex multi-step legal-adjacent analysis.
 * Slower and more expensive than deepseek-chat.
 */
export function reason(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
  return deepseekFetch(messages, 'deepseek-reasoner', {
    ...options,
    maxTokens: options.maxTokens ?? 500,
    timeoutMs: options.timeoutMs ?? 60_000,
  })
}
