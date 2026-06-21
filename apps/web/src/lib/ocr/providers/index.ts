/**
 * OCR Provider factory.
 * Returns the configured provider based on available env vars.
 *
 * Priority:
 *   1. Google Cloud Vision (GOOGLE_CLOUD_VISION_API_KEY)
 *   2. Future: AWS Textract
 *
 * Each provider gracefully returns an OcrBlockedResult if its
 * credentials are missing — the route surfaces a 503 with the exact
 * env var names needed, no live OCR is faked.
 */
import type { OcrProvider } from '../types'
import { googleVisionProvider } from './google-vision'

export function getOcrProvider(): OcrProvider {
  // Currently only Google Vision is implemented.
  // Add additional providers here as they become available.
  return googleVisionProvider
}
