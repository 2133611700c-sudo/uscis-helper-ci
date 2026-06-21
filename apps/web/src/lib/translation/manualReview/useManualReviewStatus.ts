/**
 * useManualReviewStatus — client hook that polls
 * GET /api/translation/[sessionId]/manual-review-status.
 *
 * Returns the user-facing bucket-level state. Never exposes ticket_id,
 * admin notes, reasons[], safe_summary, or any PII.
 *
 * Polls while status is non-terminal (in_progress / awaiting_you / ready).
 * Stops when status is closed or not_in_review.
 */
'use client'

import { useEffect, useRef, useState } from 'react'

export type ManualReviewBucket =
  | 'not_in_review'
  | 'in_progress'
  | 'awaiting_you'
  | 'ready'
  | 'closed'

export interface ManualReviewStatusResponse {
  ok: true
  status: ManualReviewBucket
  messageKey: string
  estimatedHours: number | null
  nextStepKey: string | null
}

export interface ManualReviewStatusErrorResponse {
  ok: false
  error: string
}

export interface UseManualReviewStatusResult {
  /** null while loading first response */
  data: ManualReviewStatusResponse | null
  /** True while initial fetch is pending */
  loading: boolean
  /** PII-safe error tag, never raw text */
  error: 'fetch_failed' | 'invalid_response' | null
  /** Force an immediate refresh */
  refresh: () => void
}

const TERMINAL_BUCKETS: readonly ManualReviewBucket[] = ['not_in_review', 'closed']
const DEFAULT_POLL_MS = 6_000
const MAX_POLL_DURATION_MS = 10 * 60_000  // 10 min upper bound

interface Options {
  /** Override poll interval (test-only) */
  pollMs?: number
  /** Disable polling entirely (test-only) */
  disabled?: boolean
}

/**
 * Parse the public /manual-review-status response into the safe whitelist shape.
 * Drops any unknown / admin / PII-shaped fields the server may have added.
 *
 * Returns:
 *   - parsed safe shape on success
 *   - 'invalid_response' on shape mismatch
 *
 * Pure function — no React, no fetch, fully unit-testable.
 */
export function parseManualReviewStatusResponse(
  raw: unknown,
): ManualReviewStatusResponse | 'invalid_response' {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'invalid_response'
  const j = raw as Record<string, unknown>
  if (j.ok !== true) return 'invalid_response'
  if (typeof j.status !== 'string') return 'invalid_response'
  const ALLOWED_BUCKETS: ReadonlySet<string> = new Set([
    'not_in_review', 'in_progress', 'awaiting_you', 'ready', 'closed',
  ])
  if (!ALLOWED_BUCKETS.has(j.status)) return 'invalid_response'
  return {
    ok: true,
    status: j.status as ManualReviewBucket,
    messageKey: typeof j.messageKey === 'string' ? j.messageKey : 'mr.user.in_progress',
    estimatedHours: typeof j.estimatedHours === 'number' ? j.estimatedHours : null,
    nextStepKey: typeof j.nextStepKey === 'string' ? j.nextStepKey : null,
  }
}

export function useManualReviewStatus(
  sessionId: string | null | undefined,
  options: Options = {},
): UseManualReviewStatusResult {
  const [data, setData] = useState<ManualReviewStatusResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(sessionId))
  const [error, setError] = useState<UseManualReviewStatusResult['error']>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartedAtRef = useRef<number | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = () => { setRefreshTick(t => t + 1) }

  useEffect(() => {
    if (!sessionId || options.disabled) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/translation/${sessionId}/manual-review-status`)
        if (!res.ok) {
          if (!cancelled) {
            setError('fetch_failed')
            setLoading(false)
          }
          return
        }
        const json = await res.json()
        if (cancelled) return
        const parsed = parseManualReviewStatusResponse(json)
        if (parsed === 'invalid_response') {
          setError('invalid_response')
        } else {
          setData(parsed)
          setError(null)
          if (TERMINAL_BUCKETS.includes(parsed.status) && pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      } catch {
        if (!cancelled) setError('fetch_failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const pollMs = options.pollMs ?? DEFAULT_POLL_MS

    pollStartedAtRef.current = Date.now()
    fetchOnce()

    pollRef.current = setInterval(() => {
      const elapsed = Date.now() - (pollStartedAtRef.current ?? Date.now())
      if (elapsed > MAX_POLL_DURATION_MS) {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = null
        return
      }
      fetchOnce()
    }, pollMs)

    return () => {
      cancelled = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [sessionId, options.pollMs, options.disabled, refreshTick])

  return { data, loading, error, refresh }
}

/** True if the bucket status means the user should be shown a calm manual-review panel. */
export function isManualReviewActive(status: ManualReviewBucket | undefined | null): boolean {
  return status === 'in_progress' || status === 'awaiting_you' || status === 'ready'
}

/**
 * Resolve a message key to localized copy without importing server-only modules.
 * Mirrors a small subset of MANUAL_REVIEW_MESSAGES (lib/translation/manualReview/messages.ts)
 * for the buckets the wizard actually surfaces. Server-side messages.ts remains the source of
 * truth for email and API-level copy.
 */
export const MANUAL_REVIEW_CLIENT_COPY: Readonly<Record<string, Record<'en' | 'ru' | 'uk', string>>> = {
  'mr.user.not_in_review': {
    en: 'No manual review is needed at this time.',
    ru: 'Ручная проверка не требуется.',
    uk: 'Ручна перевірка не потрібна.',
  },
  'mr.user.in_progress': {
    en: 'This document needs manual review. We can help prepare it, but it cannot be automatically finalized yet. We will notify you when it is ready for review.',
    ru: 'Этот документ требует ручной проверки. Мы можем помочь подготовить перевод, но пока не можем автоматически сформировать финальный документ. Мы сообщим вам, когда он будет готов к проверке.',
    uk: 'Цей документ потребує ручної перевірки. Ми можемо допомогти підготувати переклад, але поки не можемо автоматично сформувати фінальний документ. Ми повідомимо вас, коли він буде готовий до перевірки.',
  },
  'mr.user.awaiting_you': {
    en: 'We need a small bit of additional information from you to finish this translation. Please check your email for our message.',
    ru: 'Нам нужна небольшая дополнительная информация от вас, чтобы завершить этот перевод. Пожалуйста, проверьте свою электронную почту.',
    uk: 'Нам потрібна невелика додаткова інформація від вас, щоб завершити цей переклад. Будь ласка, перевірте свою електронну пошту.',
  },
  'mr.user.ready': {
    en: 'Your document has been reviewed and is ready. Please open it to confirm the translation.',
    ru: 'Ваш документ проверен и готов. Пожалуйста, откройте его, чтобы подтвердить перевод.',
    uk: 'Ваш документ перевірено і він готовий. Будь ласка, відкрийте його, щоб підтвердити переклад.',
  },
  'mr.user.closed': {
    en: 'This case is closed. If you have questions, contact us at contact@messenginfo.com.',
    ru: 'Дело закрыто. Если у вас есть вопросы, напишите на contact@messenginfo.com.',
    uk: 'Справу закрито. Якщо у вас є запитання, напишіть на contact@messenginfo.com.',
  },
  'mr.user.next.wait': {
    en: 'No action needed from you right now.',
    ru: 'Сейчас от вас ничего не требуется.',
    uk: 'Зараз від вас нічого не потрібно.',
  },
  'mr.user.next.check_email': {
    en: 'Please check your email for our message.',
    ru: 'Пожалуйста, проверьте электронную почту.',
    uk: 'Будь ласка, перевірте електронну пошту.',
  },
  'mr.user.next.review_translation': {
    en: 'Open the translation to confirm or request changes.',
    ru: 'Откройте перевод, чтобы подтвердить или запросить изменения.',
    uk: 'Відкрийте переклад, щоб підтвердити або запросити зміни.',
  },
}

export type SupportedLocale = 'en' | 'ru' | 'uk'

export function resolveManualReviewClientCopy(
  key: string,
  locale: string,
): string {
  const safeLocale: SupportedLocale =
    locale === 'ru' || locale === 'uk' ? locale : 'en'
  const entry = MANUAL_REVIEW_CLIENT_COPY[key]
  if (!entry) {
    // Fallback to in_progress to avoid showing technical errors.
    return MANUAL_REVIEW_CLIENT_COPY['mr.user.in_progress'][safeLocale]
  }
  return entry[safeLocale] ?? entry.en
}
