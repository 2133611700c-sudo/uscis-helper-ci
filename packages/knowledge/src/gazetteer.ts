/**
 * gazetteer.ts — D2 Validator: snap a handwriting-OCR place reading to a REAL
 * Ukrainian place using a closed vocabulary + Cyrillic-confusion-weighted edit
 * distance.
 *
 * WHY: handwritten Cyrillic OCR confuses letter pairs that look alike by hand
 * (Т↔П, И↔Н, Ш↔Т, Е↔Є, Л↔А...). "Простянець" is a misread of the real city
 * "Тростянець". Instead of one hardcoded correction, we score the read against
 * a gazetteer of real places and snap to the nearest one when it is close
 * enough — generalizing the fix to ALL places.
 *
 * Seed set below = 24 oblast centres + the cities present in the project's
 * real-document set + common raion centres. Production MUST load the full
 * KOATUU / "Кодифікатор адміністративно-територіальних одиниць" (~28-30k
 * settlements) into GAZETTEER — the matcher does not change, only the data.
 *
 * Returns Cyrillic; KMU-55 transliteration happens downstream.
 */

import { SETTLEMENT_ROWS } from './registry/settlements.generated'

export interface PlaceMatch {
  /** The value to USE. NEVER a silent fuzzy replacement: on an EXACT match it is the
   *  gazetteer name; on a fuzzy/no match it is the RAW cleaned read (preserved). */
  value: string
  /** True ONLY on an exact gazetteer match. A fuzzy candidate is NOT a match. */
  matched: boolean
  /** Weighted edit distance to the nearest entry (0 = exact). */
  distance: number
  /** Human must confirm (any fuzzy candidate or no confident match). */
  review_required: boolean
  /** Fuzzy candidate to SUGGEST (never silently applied). null on exact/unknown. */
  suggestedValue?: string | null
  reason: string
}

/**
 * Letter pairs that look alike in Ukrainian handwriting / are common OCR
 * confusions. A substitution between a pair costs LESS than a normal edit, so
 * "Простянець"→"Тростянець" (П↔Т) scores as nearly-equal.
 */
const CONFUSABLE: Array<[string, string]> = [
  ['т', 'п'], ['и', 'н'], ['ш', 'т'], ['ш', 'щ'], ['е', 'є'], ['и', 'й'],
  ['л', 'а'], ['о', 'с'], ['р', 'г'], ['ц', 'щ'], ['в', 'б'], ['м', 'ш'],
  ['н', 'п'], ['і', 'и'], ['ї', 'і'], ['у', 'ч'], ['д', 'л'], ['к', 'н'],
]
const CONFUSE_COST = 0.4 // vs 1.0 for an unrelated substitution

function confusable(a: string, b: string): boolean {
  return CONFUSABLE.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

/** Weighted Levenshtein: confusable substitutions are cheap. Case-insensitive. */
export function confusionDistance(a: string, b: string): number {
  const s = a.toLocaleLowerCase('uk')
  const t = b.toLocaleLowerCase('uk')
  const n = s.length
  const m = t.length
  if (!n) return m
  if (!m) return n
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sc = s[i - 1] === t[j - 1] ? 0 : confusable(s[i - 1], t[j - 1]) ? CONFUSE_COST : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + sc, // substitution (weighted)
      )
    }
  }
  return d[n][m]
}

/**
 * Curated seed. Cyrillic nominative. Kept as a high-priority core: 24 oblast
 * centres + the project's real-document set + common raion centres — these are
 * the confusion-test anchors (Тростянець, Шаргород, Енергодар, Коломия).
 */
const CURATED_SEED: string[] = [
  // 24 oblast centres + Kyiv
  'Київ', 'Харків', 'Одеса', 'Дніпро', 'Львів', 'Запоріжжя', 'Кривий Ріг',
  'Миколаїв', 'Маріуполь', 'Вінниця', 'Херсон', 'Полтава', 'Чернігів',
  'Черкаси', 'Житомир', 'Суми', 'Хмельницький', 'Чернівці', 'Рівне',
  'Кропивницький', 'Івано-Франківськ', 'Тернопіль', 'Луцьк', 'Ужгород', 'Луганськ', 'Донецьк',
  // real-document set + common raion centres
  'Тростянець', 'Шаргород', 'Енергодар', 'Коломия', 'Бар', 'Жмеринка',
  'Могилів-Подільський', 'Козятин', 'Гайсин', 'Ладижин', 'Бердичів',
  'Біла Церква', 'Бровари', 'Ірпінь', 'Бориспіль', 'Мелітополь', 'Бердянськ',
  'Нікополь', 'Павлоград', 'Кам\'янець-Подільський', 'Мукачево', 'Дрогобич',
  'Самбір', 'Стрий', 'Нововолинськ', 'Ковель', 'Конотоп', 'Шостка',
  'Умань', 'Сміла', 'Ніжин', 'Прилуки', 'Лубни', 'Кременчук', 'Горішні Плавні',
]

/**
 * Official КАТОТТГ settlement layer (Наказ Мінрегіону №290 від 26.11.2020,
 * mtu.gov.ua) — machine-generated, sourced, the SAME registry the agent's exact
 * lookup uses. Wiring it here is the expansion the file's header mandated
 * ("Production MUST load the full ... the matcher does not change, only the
 * data"): the handwriting fuzzy-matcher now scores against the real settlement
 * vocabulary, not just the 60-item seed. HONEST SCOPE: this generated layer is
 * the city/UTS tier (~hundreds), NOT the full ~28k-village KATOTTH — extending
 * to villages = re-run scripts/gen-settlements.mts against the full source.
 */
const REGISTRY_SETTLEMENTS: string[] = SETTLEMENT_ROWS
  .filter((r) => r.category === 'settlement')
  .map((r) => r.key_uk)
  .filter((k): k is string => !!k && k.trim().length > 0)

/** Seed core + official settlement registry, de-duplicated (seed entries win on
 *  identity by appearing first). Cyrillic nominative; KMU-55 happens downstream. */
export const GAZETTEER: string[] = Array.from(new Set([...CURATED_SEED, ...REGISTRY_SETTLEMENTS]))

const GAZ_LOWER = GAZETTEER.map((c) => c.toLocaleLowerCase('uk'))

/** Clean a place token: strip settlement-type prefixes, trailing punctuation. */
function cleanPlace(raw: string): string {
  return raw
    .replace(/^\s*(?:с\.?\s*м\.?\s*т\.?|смт\.?|пгт\.?|селище(?:\s+міського\s+типу)?|місто|село|м\.|с\.)\s+/iu, '')
    .replace(/[.,;]+$/g, '')
    .trim()
}

/**
 * Snap a place reading to the nearest real Ukrainian place.
 * threshold: max (distance / length) to accept a snap. 0.34 ≈ "one cheap
 * confusable swap in a short word" still snaps; gibberish does not.
 */
export function snapCity(raw: string, opts: { threshold?: number } = {}): PlaceMatch {
  const threshold = opts.threshold ?? 0.34
  const cleaned = cleanPlace(raw ?? '')
  if (!cleaned) return { value: '', matched: false, distance: Infinity, review_required: true, suggestedValue: null, reason: 'empty' }

  const lower = cleaned.toLocaleLowerCase('uk')
  const exactIdx = GAZ_LOWER.indexOf(lower)
  if (exactIdx >= 0) {
    return { value: GAZETTEER[exactIdx], matched: true, distance: 0, review_required: false, suggestedValue: null, reason: 'exact gazetteer match' }
  }

  let best = Infinity
  let bestIdx = -1
  for (let i = 0; i < GAZ_LOWER.length; i++) {
    const dist = confusionDistance(lower, GAZ_LOWER[i])
    if (dist < best) { best = dist; bestIdx = i }
  }

  const norm = best / Math.max(lower.length, GAZ_LOWER[bestIdx]?.length ?? 1)
  // The ratio threshold alone is too loose on long names: a 9-letter word allows
  // ~3 edits, enough to "match" a DIFFERENT village sharing a common suffix
  // (Кудашівка→Жданівка dist 3, Зачепилівка→Решетилівка dist 3.4) → a wrong
  // suggestion + a review that blocked the pay button. A real OCR confusion is
  // 1-2 cheap edits (Простянець→Тростянець dist 0.4, Вінниц→Вінниця dist 1). Add
  // an ABSOLUTE cap so only genuinely-close reads are treated as fuzzy; anything
  // further is unknown_geography (accepted as-is, no review).
  const MAX_FUZZY_DISTANCE = 2
  if (bestIdx >= 0 && norm <= threshold && best <= MAX_FUZZY_DISTANCE) {
    // S1 NO-SILENT-SNAP: a fuzzy candidate is a SUGGESTION, never a silent final
    // value. Keep the RAW read; surface the nearest entry as suggestedValue; force
    // review. (Was: value = GAZETTEER[bestIdx] → "Ярошенець" silently became
    // "Тростянець".) matched=false because we did NOT replace.
    return {
      value: cleaned,
      matched: false,
      distance: best,
      review_required: true,
      suggestedValue: GAZETTEER[bestIdx],
      reason: 'fuzzy_geography_match',
    }
  }

  // No confident match — keep the cleaned read, flag for review (could be a
  // village not yet in the seed gazetteer; production KOATUU would catch it).
  return { value: cleaned, matched: false, distance: best, review_required: true, suggestedValue: null, reason: 'unknown_geography' }
}
