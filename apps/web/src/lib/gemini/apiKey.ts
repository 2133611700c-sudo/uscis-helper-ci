/**
 * gemini/apiKey.ts — resolve the Gemini API key from env, tolerant of the NAME.
 *
 * The owner rotates the Vercel key under different variable names over time
 * (GEMINI_API_KEY_PAY, GEMINI_API_KEY2, GEMINI_API_KEY_066, ...). To stop the
 * "key set but app can't see it" failure, we accept ANY `GEMINI_API_KEY*` that has
 * a value. A suffixed name is preferred over the bare `GEMINI_API_KEY` (the bare
 * one is often an old/dead key); explicit known names win first.
 */
export function getGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  // 1) explicit known names, highest priority
  const explicit =
    env.GEMINI_API_KEY_PAY || env.GEMINI_API_KEY2 || env.GEMINI_API_KEY_066
  if (explicit) return explicit
  // 2) any other suffixed GEMINI_API_KEY* (a freshly-renamed key)
  for (const [k, v] of Object.entries(env)) {
    if (k !== 'GEMINI_API_KEY' && /^GEMINI_API_KEY[0-9A-Z_]+$/.test(k) && v) return v
  }
  // 3) the bare name, last (may be stale)
  return env.GEMINI_API_KEY || ''
}
