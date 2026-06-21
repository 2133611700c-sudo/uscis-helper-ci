/**
 * apps/web/src/lib/security/rate-limit.ts
 *
 * Simple rate limiter for API routes.
 *
 * Strategy:
 *   - If KV_URL or UPSTASH_REDIS_REST_URL env vars are present → uses @upstash/ratelimit
 *   - Otherwise → falls back to in-process Map-based sliding window
 *
 * Note: In-process limiter is NOT shared across Vercel function instances.
 * It's a best-effort defense layer. For production, configure Upstash.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  source: 'memory' | 'kv'
}

// ─── In-process limiter ───────────────────────────────────────────────────────

interface WindowEntry {
  count: number
  windowStart: number
}

// Global map — survives across requests within the same function instance
const windowMap = new Map<string, WindowEntry>()

// Cleanup entries older than 5 minutes to prevent memory leak
let lastCleanup = Date.now()
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function maybeCleanup(windowMs: number): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of windowMap.entries()) {
    if (now - entry.windowStart > windowMs * 2) {
      windowMap.delete(key)
    }
  }
}

function inMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  maybeCleanup(windowMs)

  const entry = windowMap.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    windowMap.set(key, { count: 1, windowStart: now })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: new Date(now + windowMs),
      source: 'memory',
    }
  }

  entry.count += 1
  const remaining = Math.max(0, maxRequests - entry.count)
  const resetAt = new Date(entry.windowStart + windowMs)

  return {
    allowed: entry.count <= maxRequests,
    remaining,
    resetAt,
    source: 'memory',
  }
}

// ─── KV / Upstash limiter ─────────────────────────────────────────────────────

function hasKVConfig(): boolean {
  return !!(
    process.env.KV_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_URL
  )
}

async function kvRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require('@upstash/ratelimit') as {
      Ratelimit: {
        slidingWindow: (max: number, window: string) => unknown
        new (opts: { redis: unknown; limiter: unknown }): { limit: (key: string) => Promise<{ success: boolean; remaining: number; reset: number }> }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as {
      Redis: { fromEnv: () => unknown }
    }

    const redis = Redis.fromEnv()
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${Math.ceil(windowMs / 1000)} s`),
    })

    const result = await ratelimit.limit(key)
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: new Date(result.reset),
      source: 'kv',
    }
  } catch {
    // KV unavailable — fall back to in-memory
    return inMemoryRateLimit(key, maxRequests, windowMs)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key.
 *
 * @param key         Identifier (e.g. IP address, user ID, route name)
 * @param maxRequests Maximum requests allowed in the window
 * @param windowMs    Window size in milliseconds
 *
 * @example
 *   const result = await rateLimit(`ip:${ip}`, 20, 60_000)
 *   if (!result.allowed) {
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 *   }
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (hasKVConfig()) {
    return kvRateLimit(key, maxRequests, windowMs)
  }
  return inMemoryRateLimit(key, maxRequests, windowMs)
}

/**
 * Extract client IP from a Next.js request.
 * Returns 'unknown' if IP cannot be determined.
 */
export function getClientIP(req: Request): string {
  // Vercel forwards the real IP in x-forwarded-for
  const forwarded = (req.headers as Headers).get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }
  const realIP = (req.headers as Headers).get('x-real-ip')
  if (realIP) return realIP.trim()
  return 'unknown'
}
