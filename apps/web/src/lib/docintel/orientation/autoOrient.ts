/**
 * docintel/orientation/autoOrient — content-orientation correction before OCR.
 *
 * WHY: a real owner birth certificate was photographed SIDEWAYS (content rotated
 * 90°). sharp.rotate() only fixes EXIF orientation, not rotated CONTENT, so every
 * engine (Gemini, Vision) read the cursive sideways — which wrecks handwriting
 * recognition. Looking at the page upright, names/places/series became legible.
 *
 * Approach (the standard document-pipeline step): detect the upright rotation with
 * a cheap Gemini thumbnail call, rotate, and VERIFY — re-detect and correct if the
 * first guess was wrong (orientation detection is slightly unstable on fully
 * sideways pages, 90↔270). Bounded to a few iterations. Geometric only — never
 * tonal (greyscale/binarize were proven to hurt handwriting).
 *
 * Fail-open: any error returns the ORIGINAL buffer. Behind AUTO_ORIENT_ENABLED.
 */

import { withOcrCostMetrics, computeCacheKeySha, sha256Hex, estCostUsdMicros } from '@/lib/v1/ocrCostMetrics'

export type Cw = 0 | 90 | 180 | 270

const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

/** Ask Gemini how many degrees CLOCKWISE to rotate so the text is upright. */
async function detectCw(thumbB64: string, model: string, key: string): Promise<Cw | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15_000)
  try {
    // SHADOW cost metric: this is a real paid Gemini call (orientation thumbnail).
    const cacheKeySha = computeCacheKeySha({
      fileSha256: sha256Hex(thumbB64), provider: 'gemini', model,
      promptVersion: 'orient_v1', preprocVersion: 'thumb_v1',
    })
    const res = await withOcrCostMetrics(
      {
        product: 'ocr', route: 'provider:gemini_orient', provider: 'gemini',
        model, cacheKeySha, est_cost_usd_micros: estCostUsdMicros('gemini', model),
      },
      () => fetch(GEMINI_URL(model, key), {
        method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'This is a scanned identity document. By how many degrees must it be rotated CLOCKWISE so the printed text reads upright/horizontal? Answer ONLY JSON {"cw":0} or {"cw":90} or {"cw":180} or {"cw":270}.' },
            { inline_data: { mime_type: 'image/jpeg', data: thumbB64 } },
          ] }],
          generationConfig: { temperature: 0, response_mime_type: 'application/json' },
        }),
      }),
    )
    if (!res.ok) return null
    const j = await res.json()
    const cw = Number(JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')?.cw)
    return cw === 0 || cw === 90 || cw === 180 || cw === 270 ? (cw as Cw) : null
  } catch { return null } finally { clearTimeout(t) }
}

export interface AutoOrientResult {
  buffer: Buffer
  applied: number   // total clockwise degrees applied (0/90/180/270)
  iterations: number
}

/**
 * Detect + correct content orientation. Returns the corrected buffer (or the
 * original on any failure). Up to `maxIters` detect→rotate→verify passes.
 */
export async function autoOrient(
  imageBuffer: Buffer,
  geminiApiKey: string,
  geminiModel: string,
  maxIters = 3,
): Promise<AutoOrientResult> {
  try {
    const sharp = (await import('sharp')).default
    let buf = imageBuffer
    let applied = 0
    let iterations = 0
    for (let i = 0; i < maxIters; i++) {
      const thumb = await sharp(buf).resize(900, 900, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
      const cw = await detectCw(thumb.toString('base64'), geminiModel, geminiApiKey)
      iterations++
      if (cw === null || cw === 0) break // upright (or undetectable) — stop
      buf = await sharp(buf).rotate(cw).toBuffer()
      applied = (applied + cw) % 360
    }
    return { buffer: buf, applied, iterations }
  } catch {
    return { buffer: imageBuffer, applied: 0, iterations: 0 }
  }
}
