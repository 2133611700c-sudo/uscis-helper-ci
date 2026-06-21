/**
 * Tests for the wizard-side manual review client surface.
 *
 * Covers pure functions only (parsing + copy + bucket truth) — no React DOM,
 * so we don't need @testing-library/react in this repo.
 */

import { describe, it, expect } from 'vitest'

import {
  resolveManualReviewClientCopy,
  isManualReviewActive,
  parseManualReviewStatusResponse,
  MANUAL_REVIEW_CLIENT_COPY,
} from '../useManualReviewStatus'

// ── resolveManualReviewClientCopy ────────────────────────────────────────────

describe('resolveManualReviewClientCopy', () => {
  it('returns en copy for known key', () => {
    const out = resolveManualReviewClientCopy('mr.user.in_progress', 'en')
    expect(out.toLowerCase()).toContain('manual review')
  })

  it('returns ru copy for ru locale', () => {
    const out = resolveManualReviewClientCopy('mr.user.in_progress', 'ru')
    expect(out).toMatch(/[А-Яа-я]/)
  })

  it('returns uk copy for uk locale', () => {
    const out = resolveManualReviewClientCopy('mr.user.in_progress', 'uk')
    expect(out).toMatch(/[А-Яа-яІіЇїЄєҐґ]/)
  })

  it('falls back to in_progress copy on unknown key', () => {
    const out = resolveManualReviewClientCopy('mr.unknown.key', 'en')
    expect(out).toBe(MANUAL_REVIEW_CLIENT_COPY['mr.user.in_progress'].en)
  })

  it('falls back to en for unsupported locale', () => {
    const out = resolveManualReviewClientCopy('mr.user.ready', 'es')
    expect(out).toBe(MANUAL_REVIEW_CLIENT_COPY['mr.user.ready'].en)
  })

  it('client copy bundle never includes admin / debug terms', () => {
    const banned = ['admin', 'OCR', 'bbox', 'ticket', 'debug', 'audit', 'safe_summary', 'session_id']
    for (const [, locales] of Object.entries(MANUAL_REVIEW_CLIENT_COPY)) {
      for (const text of Object.values(locales)) {
        for (const b of banned) {
          expect(text.toLowerCase()).not.toContain(b.toLowerCase())
        }
      }
    }
  })

  it('client copy bundle never claims AI certification or USCIS guarantee', () => {
    const banned = ['ai-certified', 'certified by ai', 'guaranteed acceptance', 'uscis will accept', 'attorney']
    for (const [, locales] of Object.entries(MANUAL_REVIEW_CLIENT_COPY)) {
      for (const text of Object.values(locales)) {
        for (const b of banned) {
          expect(text.toLowerCase()).not.toContain(b.toLowerCase())
        }
      }
    }
  })

  it('all message keys have all 3 locales (en, ru, uk)', () => {
    for (const [key, locales] of Object.entries(MANUAL_REVIEW_CLIENT_COPY)) {
      expect(locales.en, `${key} en`).toBeTruthy()
      expect(locales.ru, `${key} ru`).toBeTruthy()
      expect(locales.uk, `${key} uk`).toBeTruthy()
    }
  })
})

// ── isManualReviewActive ─────────────────────────────────────────────────────

describe('isManualReviewActive', () => {
  it('returns true for non-terminal buckets that should show banner', () => {
    expect(isManualReviewActive('in_progress')).toBe(true)
    expect(isManualReviewActive('awaiting_you')).toBe(true)
    expect(isManualReviewActive('ready')).toBe(true)
  })

  it('returns false for buckets that should not show banner', () => {
    expect(isManualReviewActive('not_in_review')).toBe(false)
    expect(isManualReviewActive('closed')).toBe(false)
  })

  it('returns false for null / undefined', () => {
    expect(isManualReviewActive(null)).toBe(false)
    expect(isManualReviewActive(undefined)).toBe(false)
  })
})

// ── parseManualReviewStatusResponse — whitelist contract ────────────────────

describe('parseManualReviewStatusResponse', () => {
  it('returns parsed safe shape for valid response', () => {
    const out = parseManualReviewStatusResponse({
      ok: true,
      status: 'in_progress',
      messageKey: 'mr.user.in_progress',
      estimatedHours: 24,
      nextStepKey: 'mr.user.next.wait',
    })
    expect(out).toEqual({
      ok: true,
      status: 'in_progress',
      messageKey: 'mr.user.in_progress',
      estimatedHours: 24,
      nextStepKey: 'mr.user.next.wait',
    })
  })

  it('drops admin / ticket / reasons / safe_summary fields silently', () => {
    const out = parseManualReviewStatusResponse({
      ok: true,
      status: 'awaiting_you',
      messageKey: 'mr.user.awaiting_you',
      estimatedHours: null,
      nextStepKey: 'mr.user.next.check_email',
      // The server route never emits these, but if it ever did, the parser must drop them.
      admin_notes: 'leaked admin note',
      ticket_id: 'tkt_secret_123',
      reasons: ['low_ocr_confidence', 'image_quality_failed'],
      safe_summary: '[redacted]',
      contact_email: 'someone@example.com',
    } as unknown)
    expect(out).not.toBe('invalid_response')
    if (out !== 'invalid_response') {
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('admin_notes')
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('ticket_id')
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('reasons')
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('safe_summary')
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('contact_email')
    }
  })

  it('returns invalid_response when ok is missing', () => {
    expect(parseManualReviewStatusResponse({ status: 'queued' })).toBe('invalid_response')
  })

  it('returns invalid_response when status is unknown', () => {
    expect(parseManualReviewStatusResponse({ ok: true, status: 'totally_made_up' })).toBe('invalid_response')
  })

  it('returns invalid_response for non-objects / arrays / null', () => {
    expect(parseManualReviewStatusResponse(null)).toBe('invalid_response')
    expect(parseManualReviewStatusResponse('string')).toBe('invalid_response')
    expect(parseManualReviewStatusResponse([1, 2, 3])).toBe('invalid_response')
    expect(parseManualReviewStatusResponse(42)).toBe('invalid_response')
  })

  it('coerces missing messageKey to in_progress fallback', () => {
    const out = parseManualReviewStatusResponse({
      ok: true,
      status: 'ready',
      // messageKey omitted on purpose
    })
    if (out !== 'invalid_response') {
      expect(out.messageKey).toBe('mr.user.in_progress')
    }
  })

  it('coerces non-number estimatedHours to null', () => {
    const out = parseManualReviewStatusResponse({
      ok: true,
      status: 'in_progress',
      messageKey: 'mr.user.in_progress',
      estimatedHours: 'a lot',
      nextStepKey: 'mr.user.next.wait',
    })
    if (out !== 'invalid_response') {
      expect(out.estimatedHours).toBeNull()
    }
  })

  it('all 5 valid buckets are accepted', () => {
    for (const status of ['not_in_review', 'in_progress', 'awaiting_you', 'ready', 'closed']) {
      const out = parseManualReviewStatusResponse({
        ok: true,
        status,
        messageKey: 'mr.user.in_progress',
        estimatedHours: null,
        nextStepKey: null,
      })
      expect(out, `bucket ${status}`).not.toBe('invalid_response')
    }
  })
})
