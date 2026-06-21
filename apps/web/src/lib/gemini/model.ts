/**
 * gemini/model.ts — normalize model names coming from env or caller input.
 *
 * Production env values occasionally arrive with trailing whitespace/newlines.
 * For Gemini model ids this is not harmless: it changes the REST URL and turns
 * the first request into a 404 before fallback logic can recover.
 */

export function normalizeGeminiModel(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

