/**
 * lib/upload/downscaleImage — client-side image downscale before upload.
 *
 * Vercel serverless caps the request body at ~4.5 MB. Real phone photos are
 * commonly 4–12 MB, so an unmodified upload hits HTTP 413 BEFORE any OCR/vision
 * read runs — the user gets a cryptic failure instead of a result (GT bench
 * 2026-06-10, finding A). Every client upload path (translation / TPS / EAD /
 * re-parole) routes its files through this helper.
 *
 * Behavior: images above the threshold are redrawn to a max longest edge as
 * JPEG; the result is used only if it actually came out smaller. Bench showed
 * 7.1 MB → 1.5 MB at 2400 px / q0.82 with no field-accuracy loss.
 *
 * FAIL-OPEN: any error (unsupported codec, no canvas, decode failure) returns
 * the ORIGINAL file. A downscale problem must never block an upload — the server
 * still applies its own size/quality gates.
 *
 * Browser-only (uses createImageBitmap + canvas). Safe to import in client
 * components; never call on the server.
 */

const DEFAULT_THRESHOLD_BYTES = 3_800_000 // headroom under the ~4.5 MB edge cap
const DEFAULT_MAX_EDGE = 2400
const DEFAULT_QUALITY = 0.82

export interface DownscaleOptions {
  thresholdBytes?: number
  maxEdge?: number
  quality?: number
}

export async function downscaleImageForUpload(
  file: File,
  opts: DownscaleOptions = {},
): Promise<Blob> {
  const threshold = opts.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts.quality ?? DEFAULT_QUALITY

  if (!file.type.startsWith('image/') || file.size <= threshold) return file
  // PDFs and other non-raster images can't be canvas-resized; leave them alone.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file // fail-open: never block an upload on a resize problem
  }
}
