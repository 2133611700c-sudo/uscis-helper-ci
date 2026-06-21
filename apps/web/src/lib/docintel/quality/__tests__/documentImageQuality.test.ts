import { describe, it, expect, afterEach } from 'vitest'
import {
  decideImageQuality,
  isQualityGateEnabled,
  metricsFromPreprocess,
  RESHOOT_MESSAGES_RU,
  ALGORITHM_VERSION,
} from '../documentImageQuality'

describe('decideImageQuality — D0 intake verdict (pure, synthetic metrics)', () => {
  it('clean image → ACCEPT, no review, no reshoot', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 130, width: 2000, height: 1500 })
    expect(r.decision).toBe('ACCEPT')
    expect(r.review_required).toBe(false)
    expect(r.reshoot_required).toBe(false)
    expect(r.user_message_key).toBeUndefined()
    expect(r.algorithm_version).toBe(ALGORITHM_VERSION)
  })

  it('blurred image → RESHOOT_REQUIRED with photo_blurry', () => {
    const r = decideImageQuality({ blurScore: 3, brightness: 130, width: 2000, height: 1500 })
    expect(r.decision).toBe('RESHOOT_REQUIRED')
    expect(r.reshoot_required).toBe(true)
    expect(r.user_message_key).toBe('photo_blurry')
  })

  it('slightly soft image → DEGRADED_REVIEW (readable but uncertain)', () => {
    const r = decideImageQuality({ blurScore: 9, brightness: 130, width: 2000, height: 1500 })
    expect(r.decision).toBe('DEGRADED_REVIEW')
    expect(r.review_required).toBe(true)
    expect(r.reshoot_required).toBe(false)
  })

  it('too dark → RESHOOT_REQUIRED with photo_dark', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 30, width: 2000, height: 1500 })
    expect(r.decision).toBe('RESHOOT_REQUIRED')
    expect(r.user_message_key).toBe('photo_dark')
  })

  it('overexposed → RESHOOT_REQUIRED with photo_bright', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 250, width: 2000, height: 1500 })
    expect(r.decision).toBe('RESHOOT_REQUIRED')
    expect(r.user_message_key).toBe('photo_bright')
  })

  it('low contrast / dim → DEGRADED_REVIEW (not a hard reshoot)', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 60, width: 2000, height: 1500 })
    expect(r.decision).toBe('DEGRADED_REVIEW')
    expect(r.reshoot_required).toBe(false)
  })

  it('cropped / too small (low resolution) → RESHOOT_REQUIRED', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 130, width: 500, height: 400 })
    expect(r.decision).toBe('RESHOOT_REQUIRED')
    expect(r.user_message_key).toBe('photo_low_resolution')
  })

  it('blur is NEVER an anti-fabrication signal — result carries no fabrication field/reason', () => {
    const r = decideImageQuality({ blurScore: 1, brightness: 130, width: 2000, height: 1500 })
    expect(r).not.toHaveProperty('fabrication')
    const text = JSON.stringify(r).toLowerCase()
    expect(text).not.toContain('fabricat')
    expect(text).not.toContain('anti_fab')
    expect(text).not.toContain('identity') // quality is about the image, not the person
  })

  it('output is PII-free — only signal names, statuses, numeric scores, message keys', () => {
    const r = decideImageQuality({ blurScore: 3, brightness: 30, width: 500, height: 400 })
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/[Ѐ-ӿ]/) // no Cyrillic values leak into the structured result
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/) // no dates
  })

  it('unmeasured signals are present as ok/not_measured (placeholders, never force a verdict)', () => {
    const r = decideImageQuality({ blurScore: 40, brightness: 130, width: 2000, height: 1500 })
    for (const name of ['crop_bounds', 'contrast', 'orientation', 'document_visibility']) {
      const s = r.signals.find((x) => x.name === name)!
      expect(s.status).toBe('ok')
      expect(s.reason).toBe('not_measured')
    }
    expect(r.decision).toBe('ACCEPT')
  })

  it('missing metrics → no false fail (decides on what is present)', () => {
    expect(decideImageQuality({}).decision).toBe('ACCEPT')
    expect(decideImageQuality({ brightness: 130 }).decision).toBe('ACCEPT')
  })
})

describe('isQualityGateEnabled — default OFF', () => {
  afterEach(() => { delete process.env.QUALITY_GATE_ENABLED })
  it('absent → false', () => { delete process.env.QUALITY_GATE_ENABLED; expect(isQualityGateEnabled()).toBe(false) })
  it('"0" → false', () => { expect(isQualityGateEnabled({ QUALITY_GATE_ENABLED: '0' })).toBe(false) })
  it('"1" → true', () => { expect(isQualityGateEnabled({ QUALITY_GATE_ENABLED: '1' })).toBe(true) })
})

describe('metricsFromPreprocess — adapter over existing preprocess quality', () => {
  it('maps brightness/blurScore/width/height', () => {
    const m = metricsFromPreprocess({ quality: { brightness: 120, blurScore: 30 }, width: 1800, height: 1200 })
    expect(m).toEqual({ blurScore: 30, brightness: 120, width: 1800, height: 1200 })
  })
})

describe('RESHOOT_MESSAGES_RU — large-print friendly copy', () => {
  it('has a message for every key', () => {
    for (const k of ['photo_blurry', 'photo_dark', 'photo_bright', 'photo_cropped', 'photo_low_resolution'] as const) {
      expect(RESHOOT_MESSAGES_RU[k].length).toBeGreaterThan(10)
    }
  })
})
