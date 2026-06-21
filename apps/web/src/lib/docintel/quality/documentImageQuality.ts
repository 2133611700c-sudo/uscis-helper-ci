/**
 * docintel/quality/documentImageQuality — D0 intake quality / reshoot decision.
 *
 * Pure, deterministic. Maps already-computed image metrics (brightness, blur,
 * resolution — produced by lib/ocr/image-preprocess) into a usability verdict:
 *   ACCEPT          — clean enough to read.
 *   DEGRADED_REVIEW — readable but uncertain; continue, raise a review signal.
 *   RESHOOT_REQUIRED— too blurry/dark/small to safely read; ask the user to retake.
 *
 * HARD RULE: this is about IMAGE USABILITY ONLY. Blur (or any quality signal) is
 * NEVER an anti-fabrication signal — a sharp photo of the wrong identity is still
 * wrong, and a blurry photo of the right identity is still right. The result carries
 * NO fabrication field. Quality ≠ fabrication. (See AGENT_OPERATING_CONTRACT.md.)
 *
 * Behind the flag QUALITY_GATE_ENABLED (default OFF). Flag OFF = byte-identical prod:
 * callers must guard on isQualityGateEnabled() before using this. No model call, no I/O.
 */

export type QualityDecision = 'ACCEPT' | 'DEGRADED_REVIEW' | 'RESHOOT_REQUIRED'

export type QualitySignalName =
  | 'blur'
  | 'brightness'
  | 'resolution'
  | 'crop_bounds'
  | 'contrast'
  | 'orientation'
  | 'document_visibility'

export interface QualitySignal {
  name: QualitySignalName
  status: 'ok' | 'warning' | 'fail'
  score?: number
  reason?: string
}

/** Metrics produced upstream (lib/ocr/image-preprocess PreprocessResult). PII-free numbers only. */
export interface QualityMetrics {
  blurScore?: number // Laplacian stdev — higher = sharper
  brightness?: number // 0..255 mean
  width?: number
  height?: number
}

export type ReshootMessageKey =
  | 'photo_blurry'
  | 'photo_dark'
  | 'photo_bright'
  | 'photo_cropped'
  | 'photo_low_resolution'

export interface DocumentImageQualityResult {
  decision: QualityDecision
  signals: QualitySignal[]
  review_required: boolean
  reshoot_required: boolean
  user_message_key?: ReshootMessageKey
  algorithm_version: string
}

export const ALGORITHM_VERSION = 'd0-quality-1'

// Thresholds — consistent with lib/ocr/image-preprocess + engine/preprocess
// (too_dark<40, overexposed>245, too_small<600). Calibratable; documented, not magic.
export const QUALITY_THRESHOLDS = {
  blur: { fail: 5, warn: 12 }, // blurScore (Laplacian stdev) below → blurry
  brightnessDark: { fail: 40, warn: 70 },
  brightnessBright: { fail: 245, warn: 235 },
  minDimension: { fail: 600, warn: 900 },
} as const

/** Reader contract flag — default OFF. Flag OFF ⇒ callers must not change behavior. */
export function isQualityGateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.QUALITY_GATE_ENABLED === '1'
}

/** Map the existing preprocess quality block into the pure metrics this module reads. */
export function metricsFromPreprocess(p: {
  quality?: { brightness?: number; blurScore?: number }
  width?: number
  height?: number
}): QualityMetrics {
  return {
    blurScore: p.quality?.blurScore,
    brightness: p.quality?.brightness,
    width: p.width,
    height: p.height,
  }
}

const rank = { ok: 0, warning: 1, fail: 2 } as const

/**
 * Pure decision. Unmeasured signals (crop_bounds/contrast/orientation/document_visibility
 * are not computed upstream yet) are emitted as status 'ok' reason 'not_measured' so they
 * never force a verdict — they are placeholders for future D0 work, not silent failures.
 */
export function decideImageQuality(metrics: QualityMetrics): DocumentImageQualityResult {
  const signals: QualitySignal[] = []

  // blur
  if (typeof metrics.blurScore === 'number') {
    const s = metrics.blurScore
    signals.push({
      name: 'blur',
      status: s < QUALITY_THRESHOLDS.blur.fail ? 'fail' : s < QUALITY_THRESHOLDS.blur.warn ? 'warning' : 'ok',
      score: s,
      reason: s < QUALITY_THRESHOLDS.blur.warn ? 'image_appears_blurry' : undefined,
    })
  }

  // brightness (too dark / too bright)
  if (typeof metrics.brightness === 'number') {
    const b = metrics.brightness
    let status: QualitySignal['status'] = 'ok'
    let reason: string | undefined
    if (b < QUALITY_THRESHOLDS.brightnessDark.fail) { status = 'fail'; reason = 'image_too_dark' }
    else if (b > QUALITY_THRESHOLDS.brightnessBright.fail) { status = 'fail'; reason = 'image_too_bright' }
    else if (b < QUALITY_THRESHOLDS.brightnessDark.warn) { status = 'warning'; reason = 'image_dim' }
    else if (b > QUALITY_THRESHOLDS.brightnessBright.warn) { status = 'warning'; reason = 'image_bright' }
    signals.push({ name: 'brightness', status, score: b, reason })
  }

  // resolution (a too-small image often means the document is cropped/far away)
  if (typeof metrics.width === 'number' && typeof metrics.height === 'number') {
    const mn = Math.min(metrics.width, metrics.height)
    signals.push({
      name: 'resolution',
      status: mn < QUALITY_THRESHOLDS.minDimension.fail ? 'fail' : mn < QUALITY_THRESHOLDS.minDimension.warn ? 'warning' : 'ok',
      score: mn,
      reason: mn < QUALITY_THRESHOLDS.minDimension.warn ? 'image_low_resolution' : undefined,
    })
  }

  // Not-yet-measured signals — placeholders, never force a verdict.
  for (const name of ['crop_bounds', 'contrast', 'orientation', 'document_visibility'] as QualitySignalName[]) {
    signals.push({ name, status: 'ok', reason: 'not_measured' })
  }

  const worst = signals.reduce((m, s) => (rank[s.status] > rank[m] ? s.status : m), 'ok' as QualitySignal['status'])
  const decision: QualityDecision =
    worst === 'fail' ? 'RESHOOT_REQUIRED' : worst === 'warning' ? 'DEGRADED_REVIEW' : 'ACCEPT'

  return {
    decision,
    signals,
    review_required: decision !== 'ACCEPT',
    reshoot_required: decision === 'RESHOOT_REQUIRED',
    user_message_key: decision === 'RESHOOT_REQUIRED' ? worstFailMessageKey(signals) : undefined,
    algorithm_version: ALGORITHM_VERSION,
  }
}

function worstFailMessageKey(signals: QualitySignal[]): ReshootMessageKey | undefined {
  const fail = signals.find((s) => s.status === 'fail')
  if (!fail) return undefined
  switch (fail.name) {
    case 'blur': return 'photo_blurry'
    case 'brightness': return fail.reason === 'image_too_bright' ? 'photo_bright' : 'photo_dark'
    case 'resolution': return 'photo_low_resolution'
    case 'crop_bounds': return 'photo_cropped'
    default: return 'photo_blurry'
  }
}

/** Plain, large-print-friendly reshoot copy (RU). UI maps these keys → localized strings. */
export const RESHOOT_MESSAGES_RU: Record<ReshootMessageKey, string> = {
  photo_blurry: 'Фото размыто. Пожалуйста, переснимите документ ближе и при хорошем свете.',
  photo_dark: 'Фото слишком тёмное. Пожалуйста, включите свет и переснимите.',
  photo_bright: 'Фото пересвечено. Пожалуйста, уберите блики и переснимите.',
  photo_cropped: 'Край документа обрезан. Пожалуйста, переснимите так, чтобы весь документ был в кадре.',
  photo_low_resolution: 'Фото слишком маленькое. Пожалуйста, переснимите документ крупнее и в кадре целиком.',
}
