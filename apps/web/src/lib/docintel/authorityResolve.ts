/**
 * docintel/authorityResolve — P2.3 (SMART_NORMALIZE_ENABLED, default OFF).
 *
 * Post-pass over the full ExtractedDocField[] that resolves issuing-authority
 * fields (kind 'agency') from raw Cyrillic into the canonical English name via
 * the sourced registry (`resolveAuthority` in dictionaryBridge). Runs at the
 * document level — like the patronymic pass — so it shares the same door
 * (`readDocument`, called by all 4 products) AND can carry the registry's
 * `review_required` onto the field (the per-field `toCanonicalValue` returns a
 * bare string and would drop it).
 *
 * Hard rules:
 *   - Only acts on a registry MATCH; no match → field untouched (keeps the
 *     transliteration `toCanonicalValue` already produced — no silent loss).
 *   - Carries the registry review flag (ЗАГС / міліція → review); never LOWERS
 *     an existing flag.
 */

import { resolveAuthority } from '@/lib/tps/dictionaryBridge'
import type { ExtractedDocField } from './types'

export function resolveAuthorityFields(fields: ExtractedDocField[]): ExtractedDocField[] {
  return fields.map((f) => {
    if (f.kind !== 'agency') return f // only issuing-authority fields

    const cy = (f.raw_cyrillic ?? '').trim()
    if (!cy) return f // nothing read

    const res = resolveAuthority(cy)
    // 'knowledge' source = a real registry match. Anything else → keep as-is.
    if (res.source !== 'knowledge' || !res.value) return f

    return {
      ...f,
      value: res.value,
      // Trusted registry expansion (like an exact city match): do not force
      // review just for resolving; carry the registry's own flag, never lower.
      review_required: f.review_required || res.review_required === true,
    }
  })
}
