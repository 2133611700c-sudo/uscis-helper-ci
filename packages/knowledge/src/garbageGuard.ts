/**
 * garbageGuard.ts — reject OCR garbage / label-as-value before a field is shown to
 * the user as "recognized". The live booklet test produced given_name = "„ Пріз"
 * (a fragment of the label «Прізвище» with a quote glyph) — that must NEVER be
 * accepted as a name. Pure, deterministic, unit-testable.
 */

// Ukrainian field labels (and fragments) that must never appear AS a value.
const LABEL_TOKENS = [
  'прізвище', 'пріз', 'імʼя', "ім'я", 'імя', 'по батькові', 'батькові',
  'дата народження', 'народження', 'місце народження', 'місце', 'стать',
  'серія', 'номер', 'паспорт', 'громадянство', 'ким виданий', 'дата видачі',
  'surname', 'given name', 'patronymic', 'date of birth', 'place of birth', 'sex',
]

// Leading garbage glyphs commonly emitted by OCR on rotated/dense scans.
const GARBAGE_PREFIX = /^[\s„“”"'‚‘`«»·.,:;–—\-]+/

const STRIP_PUNCT = /[\s„“”"'‚‘`«»·.,:;–—\-_/\\|()[\]{}]+/g

export interface GarbageVerdict {
  garbage: boolean
  reason?: 'empty' | 'label_as_value' | 'punctuation_only' | 'too_short' | 'quote_prefix'
}

/**
 * Is this OCR value garbage that must NOT be shown as a recognized field value?
 * `minLen` defaults to 2 (names/places). Pass a higher value for stricter fields.
 */
export function classifyGarbage(value: string | null | undefined, minLen = 2): GarbageVerdict {
  const raw = (value ?? '').trim()
  if (!raw) return { garbage: true, reason: 'empty' }

  // leading quote/garbage glyph followed by a label fragment → "„ Пріз"
  if (GARBAGE_PREFIX.test(raw)) {
    const after = raw.replace(GARBAGE_PREFIX, '').toLowerCase().trim()
    if (LABEL_TOKENS.some((t) => after === t || after.startsWith(t))) {
      return { garbage: true, reason: 'quote_prefix' }
    }
  }

  const lower = raw.toLowerCase()
  // value IS (or starts with) a field label
  if (LABEL_TOKENS.some((t) => lower === t || lower === t + ':' || lower.startsWith(t + ' '))) {
    return { garbage: true, reason: 'label_as_value' }
  }

  // nothing left after removing punctuation → punctuation/garbage only
  const lettersDigits = raw.replace(STRIP_PUNCT, '')
  if (!lettersDigits) return { garbage: true, reason: 'punctuation_only' }

  if (lettersDigits.length < minLen) return { garbage: true, reason: 'too_short' }

  return { garbage: false }
}

/** True when the value is garbage and must be downgraded to review/empty. */
export function isGarbageValue(value: string | null | undefined, minLen = 2): boolean {
  return classifyGarbage(value, minLen).garbage
}
