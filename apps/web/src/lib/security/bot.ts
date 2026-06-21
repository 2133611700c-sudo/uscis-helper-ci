/**
 * Bot detection for page routes.
 * Applied in middleware.ts (API routes are excluded by the matcher).
 *
 * Philosophy: block tools commonly used for scraping and attack automation.
 * Allow legitimate crawlers (Googlebot, Bingbot, facebookexternalhit) so SEO is unaffected.
 * A missing User-Agent on a page request is also treated as suspicious.
 */
import type { NextRequest } from 'next/server'

/** UA substrings associated with scraping tools, vuln scanners, and automated attack frameworks */
const BLOCKED_UA_PATTERNS: RegExp[] = [
  /python-requests/i,
  /scrapy/i,
  /wget\//i,
  /curl\//i,
  /libwww-perl/i,
  /sqlmap/i,           // SQL injection scanner
  /nikto/i,            // Web vulnerability scanner
  /masscan/i,          // Port/banner scanner
  /zgrab/i,            // Banner grabber
  /go-http-client/i,   // Generic Go HTTP client (rarely a real browser)
  /okhttp\//i,         // Android HTTP library (when used without real app UA)
  /java\//i,           // Raw Java HTTP client
  /perl\//i,
  /php\//i,
  /petalbot/i,         // Huawei crawler — overly aggressive
  /semrushbot/i,
  /ahrefsbot/i,
  /majestic/i,
  /dotbot/i,
  /mj12bot/i,
  /blexbot/i,
  /dataforseobot/i,
]

/**
 * Returns true if the request looks like a malicious or unwanted bot.
 * Designed for page routes only (bot checks on API routes would block
 * legitimate programmatic clients — use rate limiting there instead).
 */
export function isMaliciousBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (!ua) return true  // blank UA on a page request is always suspicious
  return BLOCKED_UA_PATTERNS.some(p => p.test(ua))
}
