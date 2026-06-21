/**
 * Image preprocessing for OCR.
 *
 * Steps (in order):
 *   1. Reject unsupported formats (PDF, HEIC, etc.) with clear error
 *   2. Normalise EXIF orientation (auto-rotate)
 *   3. Resize to ≤ PREPROCESS_MAX_DIMENSION (preserving aspect ratio)
 *   4. Convert to JPEG at PREPROCESS_JPEG_QUALITY
 *   5. Basic blur/crop quality check
 *
 * Uses `sharp` (server-only). Gracefully degrades to pass-through
 * if sharp is unavailable (e.g., edge runtime without native binaries).
 */

const PREPROCESS_MAX_DIMENSION = 2048   // px — large enough for Vision, small enough to avoid timeouts
const PREPROCESS_JPEG_QUALITY  = 85     // higher than old 70 — Vision benefits from quality

// ── Quality gate thresholds (LENIENT — only reject obviously bad images) ──
// These are intentionally low to avoid false rejections. Calibrate with real user photos.
const MIN_DIMENSION          = 200     // px — below this, OCR text is unreadable
const MIN_BRIGHTNESS         = 15      // 0-255 scale — below is near-black
const MAX_BRIGHTNESS         = 248     // 0-255 scale — above is near-white / overexposed
const MIN_BLUR_SCORE         = 2.5     // Laplacian stdev — below is severely out of focus

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/bmp' | 'image/tiff'
export type UnsupportedMimeType = string  // anything else

const SUPPORTED_MIME_TYPES: SupportedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
]

export interface PreprocessResult {
  ok: true
  buffer: Buffer
  mimeType: 'image/jpeg'
  originalMimeType: string
  width: number
  height: number
  resized: boolean
  scaleFactor: number   // < 1 if image was shrunk; 1.0 if not resized
  /** Image quality metrics (for diagnostics and future threshold calibration) */
  quality: {
    brightness: number    // 0-255 mean across channels
    blurScore: number     // Laplacian stdev — higher = sharper
    assessment: 'good' | 'acceptable' | 'poor'
    warnings: string[]    // human-readable quality concerns
  }
}

export interface PreprocessError {
  ok: false
  code: 'unsupported_file_type' | 'corrupt_image' | 'too_small' | 'too_blurry' | 'too_dark' | 'too_bright'
  message: string          // user-safe message
  detail?: string          // internal detail (do NOT send to client)
}

export async function preprocessImage(
  buffer: Buffer,
  mimeType: string
): Promise<PreprocessResult | PreprocessError> {

  // ── 0. HEIC/HEIF (iPhone default) → JPEG ─────────────────────────────────
  // sharp's prebuilt libvips lacks the HEVC codec, so decode goes through
  // heicToJpeg (WASM libde265). Fail-open: an undecodable file keeps its
  // original mime and is rejected by step 1 with the standard message.
  // This single hook fixes HEIC for every caller (TPS, EAD, Reparole,
  // translation) — those routes already ACCEPTED heic by MIME but this
  // module then rejected it.
  {
    const { heicToJpeg } = await import('./heicToJpeg')
    const conv = await heicToJpeg(buffer, mimeType)
    if (conv.converted) {
      buffer = conv.buffer
      mimeType = conv.mimeType
    }
  }

  // ── 1. Reject unsupported formats ────────────────────────────────────────
  const lowerMime = mimeType.toLowerCase().split(';')[0].trim()
  if (!SUPPORTED_MIME_TYPES.includes(lowerMime as SupportedMimeType)) {
    return {
      ok: false,
      code: 'unsupported_file_type',
      message:
        lowerMime.includes('pdf')
          ? 'PDF files are not yet supported. Please take a photo of your document and upload that instead.'
          : `File type "${lowerMime}" is not supported. Please upload a JPEG or PNG photo.`,
      detail: `Unsupported MIME: ${lowerMime}`,
    }
  }

  // ── 2–5. Sharp processing ─────────────────────────────────────────────────
  try {
    const sharp = (await import('sharp')).default

    // Load with EXIF rotation normalisation
    const pipeline = sharp(buffer, { failOn: 'error' }).rotate()  // auto-rotate from EXIF

    const meta = await pipeline.clone().metadata()
    const origW = meta.width ?? 0
    const origH = meta.height ?? 0

    if (origW < MIN_DIMENSION || origH < MIN_DIMENSION) {
      return {
        ok: false,
        code: 'too_small',
        message: 'The image is too small to read. Please take a closer, higher-resolution photo.',
        detail: `Image dimensions: ${origW}×${origH}, minimum: ${MIN_DIMENSION}×${MIN_DIMENSION}`,
      }
    }

    const needsResize = origW > PREPROCESS_MAX_DIMENSION || origH > PREPROCESS_MAX_DIMENSION
    const scaleFactor = needsResize
      ? PREPROCESS_MAX_DIMENSION / Math.max(origW, origH)
      : 1.0

    const resized = pipeline.clone().resize(PREPROCESS_MAX_DIMENSION, PREPROCESS_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })

    const outputBuffer = await resized
      .jpeg({ quality: PREPROCESS_JPEG_QUALITY, mozjpeg: false })
      .toBuffer({ resolveWithObject: true })

    const finalW = outputBuffer.info.width
    const finalH = outputBuffer.info.height

    // ── 5. Quality gate: brightness + blur ─────────────────────────────────
    // Run on the final JPEG buffer (post-resize) so we measure what Vision will see.
    const qualityWarnings: string[] = []
    let brightness = 128  // safe default
    let blurScore = 10    // safe default

    try {
      // Brightness: mean value across all channels (0-255)
      const stats = await sharp(outputBuffer.data).stats()
      brightness = stats.channels.reduce((s, c) => s + c.mean, 0) / stats.channels.length

      // Blur: standard deviation of Laplacian-filtered grayscale image.
      // High stdev = sharp edges = good image. Low stdev = few edges = blurry.
      const laplacianStats = await sharp(outputBuffer.data)
        .greyscale()
        .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
        .stats()
      blurScore = laplacianStats.channels[0].stdev
    } catch {
      // If quality analysis fails, proceed with safe defaults (don't block the upload)
      qualityWarnings.push('quality_analysis_fallback')
    }

    // Hard rejects (only for obviously unusable images)
    if (brightness < MIN_BRIGHTNESS) {
      return {
        ok: false,
        code: 'too_dark' as const,
        message: 'The photo is too dark to read. Please retake with better lighting.',
        detail: `brightness=${brightness.toFixed(1)}, threshold=${MIN_BRIGHTNESS}`,
      }
    }
    if (brightness > MAX_BRIGHTNESS) {
      return {
        ok: false,
        code: 'too_bright' as const,
        message: 'The photo is overexposed (too bright). Please retake without direct flash or glare.',
        detail: `brightness=${brightness.toFixed(1)}, threshold=${MAX_BRIGHTNESS}`,
      }
    }
    if (blurScore < MIN_BLUR_SCORE) {
      return {
        ok: false,
        code: 'too_blurry' as const,
        message: 'The photo is too blurry to read. Please hold the camera steady and retake.',
        detail: `blurScore=${blurScore.toFixed(2)}, threshold=${MIN_BLUR_SCORE}`,
      }
    }

    // Soft warnings (image is usable but quality might affect OCR accuracy)
    if (brightness < 40) qualityWarnings.push('low_brightness')
    if (brightness > 220) qualityWarnings.push('high_brightness')
    if (blurScore < 8) qualityWarnings.push('mild_blur')

    const assessment: 'good' | 'acceptable' | 'poor' =
      qualityWarnings.length === 0 ? 'good'
      : qualityWarnings.length <= 2 ? 'acceptable'
      : 'poor'

    return {
      ok: true,
      buffer: outputBuffer.data,
      mimeType: 'image/jpeg',
      originalMimeType: mimeType,
      width: finalW,
      height: finalH,
      resized: needsResize,
      scaleFactor,
      quality: {
        brightness: Math.round(brightness * 10) / 10,
        blurScore: Math.round(blurScore * 100) / 100,
        assessment,
        warnings: qualityWarnings,
      },
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes('sharp') || msg.includes('Cannot find module')) {
      // sharp not available — pass through unmodified
      console.warn('[image-preprocess] sharp not available, passing through unmodified')
      return {
        ok: true,
        buffer,
        mimeType: 'image/jpeg',
        originalMimeType: mimeType,
        width: 0,
        height: 0,
        resized: false,
        scaleFactor: 1.0,
        quality: { brightness: 0, blurScore: 0, assessment: 'acceptable', warnings: ['sharp_unavailable'] },
      }
    }

    return {
      ok: false,
      code: 'corrupt_image',
      message: 'Could not read the image file. Please re-upload a clear JPEG or PNG photo.',
      detail: msg,
    }
  }
}
