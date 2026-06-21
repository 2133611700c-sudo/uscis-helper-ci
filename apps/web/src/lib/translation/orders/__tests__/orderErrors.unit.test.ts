/**
 * orderErrors.unit.test.ts — pure unit tests for the translation/orders module (no DB).
 */
import { describe, it, expect } from 'vitest'
import {
  classifyOrderError,
  TranslationOrderError,
  TRANSLATION_ORDER_STATUSES,
  TRANSLATION_ARTIFACTS_BUCKET,
} from '..'

describe('classifyOrderError', () => {
  it('maps each known Postgres error string to a typed code', () => {
    expect(classifyOrderError('ERROR: ORDER_STATE_CONFLICT expected=x current=y')).toBe('ORDER_STATE_CONFLICT')
    expect(classifyOrderError('ORDER_VERSION_CONFLICT expected=1 current=2')).toBe('ORDER_VERSION_CONFLICT')
    expect(classifyOrderError('ORDER_VERSION_DECREMENT_FORBIDDEN old=2 new=1')).toBe('ORDER_VERSION_CONFLICT')
    expect(classifyOrderError('ORDER_INVALID_TRANSITION from=queued to=delivered')).toBe('ORDER_INVALID_TRANSITION')
    expect(classifyOrderError('ORDER_ACTOR_REQUIRED: actor must be non-null')).toBe('ORDER_ACTOR_REQUIRED')
    expect(classifyOrderError('ORDER_NOT_FOUND: abc')).toBe('ORDER_NOT_FOUND')
  })

  it('maps duplicate-key / idempotency violations to ORDER_DUPLICATE_DELIVERY', () => {
    expect(classifyOrderError('duplicate key value violates unique constraint "delivery_outbox_idempotency_key_key"')).toBe('ORDER_DUPLICATE_DELIVERY')
    expect(classifyOrderError('value for idempotency_key already exists')).toBe('ORDER_DUPLICATE_DELIVERY')
  })

  it('returns null for unknown / empty messages', () => {
    expect(classifyOrderError(undefined)).toBeNull()
    expect(classifyOrderError('some unrelated network timeout')).toBeNull()
  })
})

describe('TranslationOrderError', () => {
  it('carries the typed code and is an Error', () => {
    const e = new TranslationOrderError('ORDER_STATE_CONFLICT', 'detail')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('ORDER_STATE_CONFLICT')
    expect(e.name).toBe('TranslationOrderError')
    expect(e.message).toBe('detail')
  })

  it('defaults message to the code when none given', () => {
    const e = new TranslationOrderError('ORDER_NOT_FOUND')
    expect(e.message).toBe('ORDER_NOT_FOUND')
  })
})

describe('constants', () => {
  it('exposes all ten pipeline statuses in order', () => {
    expect(TRANSLATION_ORDER_STATUSES).toEqual([
      'queued', 'assigned', 'in_review', 'needs_user_clarification', 'approved_for_render',
      'artifact_generated', 'delivery_pending', 'delivered', 'delivery_failed', 'cancelled',
    ])
  })
  it('uses the private artifacts bucket name', () => {
    expect(TRANSLATION_ARTIFACTS_BUCKET).toBe('translation-artifacts')
  })
})
