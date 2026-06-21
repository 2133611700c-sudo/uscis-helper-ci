/**
 * patronymic.ts — D2 Validator: Ukrainian patronymic (по батькові) engine.
 *
 * WHY THIS EXISTS
 * Handwritten Cyrillic OCR routinely returns a SUFFIX FRAGMENT for the
 * patronymic ("ович", "Yovych") instead of the full word, or a garbled stem.
 * A patronymic is NOT free text — in Ukrainian it is DERIVED deterministically
 * from the father's given name + the child's sex. So instead of trusting a
 * shaky read, the Chief Engineer (Central Brain) can:
 *   1. VALIDATE a read (is it a complete, well-formed patronymic?), and
 *   2. RECONSTRUCT it from the given name + sex when the read is a fragment.
 *
 * This module NEVER guesses silently. When it cannot derive a value with
 * confidence, it returns review_required=true and an empty/candidate value —
 * the human confirms. (v5 §7: model "what seems likely" is never source of
 * truth; D2 only emits values it can derive from closed rules.)
 *
 * Cyrillic only. KMU-55 transliteration happens downstream (Transliterator).
 */

export type Sex = 'M' | 'F'

export interface PatronymicResult {
  /** Canonical Cyrillic patronymic, or '' when not derivable. */
  value: string
  /** How we got it. */
  source: 'read_valid' | 'generated_regular' | 'generated_exception' | 'unresolved'
  /** Human must confirm before this becomes final. */
  review_required: boolean
  /** Short machine-readable reason for the audit log. */
  reason: string
}

const MALE_SUFFIXES = ['ович', 'йович', 'ьович', 'ич'] as const
const FEMALE_SUFFIXES = ['івна', 'ївна', 'инічна', 'ічна'] as const

/**
 * Irregular / non-productive given names whose patronymic cannot be produced
 * by the regular rules. Seeded from real Ukrainian usage + the documents in
 * the project's ground-truth set. Extend as the gazetteer of names grows.
 * Key = given name in nominative (lowercase Cyrillic).
 */
const EXCEPTIONS: Record<string, { M: string; F: string }> = {
  // -о / -а stems that take an inserted -й- or an irregular stem
  'микола':   { M: 'Миколайович',  F: 'Миколаївна' },
  'петро':    { M: 'Петрович',     F: 'Петрівна' },
  'павло':    { M: 'Павлович',     F: 'Павлівна' },
  'дмитро':   { M: 'Дмитрович',    F: 'Дмитрівна' },
  'григорій': { M: 'Григорович',   F: 'Григорівна' },
  'ілля':     { M: 'Ілліч',        F: 'Іллівна' },
  'лука':     { M: 'Лукич',        F: 'Луківна' },
  'кузьма':   { M: 'Кузьмич',      F: 'Кузьмівна' },
  'хома':     { M: 'Хомич',        F: 'Хомівна' },
  'сава':     { M: 'Савич',        F: 'Савівна' },
  'микита':   { M: 'Микитович',    F: 'Микитівна' },
  'яків':     { M: 'Якович',       F: 'Яківна' },
  'лев':      { M: 'Львович',      F: 'Львівна' },
}

/** Normalize a Cyrillic name token for lookup/derivation. */
function norm(s: string): string {
  return (s ?? '').trim().replace(/\s+/g, ' ')
}

/** Title-case a Cyrillic word (first letter upper, rest as-is lower). */
function titleCase(s: string): string {
  if (!s) return s
  return s[0].toLocaleUpperCase('uk') + s.slice(1).toLocaleLowerCase('uk')
}

/**
 * Is `value` a complete, well-formed patronymic for the given sex?
 * Rejects suffix fragments ("ович" alone), digits, and too-short tokens.
 */
export function isValidPatronymic(value: string, sex?: Sex): boolean {
  const v = norm(value).toLocaleLowerCase('uk')
  if (!v || /[0-9]/.test(v)) return false
  if (v.length < 6) return false // "ович"(4)/"йович"(5) fragments rejected; shortest real ≈ "Ілліч"(5)→allow? no: require root
  const suffixes = sex === 'F' ? FEMALE_SUFFIXES : sex === 'M' ? MALE_SUFFIXES : [...MALE_SUFFIXES, ...FEMALE_SUFFIXES]
  const endsOk = suffixes.some((suf) => v.endsWith(suf))
  if (!endsOk) return false
  // Must have a real root before the suffix (reject bare suffix fragments).
  const matched = suffixes.find((suf) => v.endsWith(suf))!
  const root = v.slice(0, v.length - matched.length)
  return root.length >= 2
}

/**
 * Derive the patronymic from a father's given name + sex using the regular
 * Ukrainian rules, falling back to the exceptions table. Returns '' when the
 * name shape is not covered (caller must send to human review).
 */
export function generatePatronymic(givenName: string, sex: Sex): { value: string; source: PatronymicResult['source'] } {
  const name = norm(givenName).toLocaleLowerCase('uk')
  if (!name || name.length < 2) return { value: '', source: 'unresolved' }

  const ex = EXCEPTIONS[name]
  if (ex) return { value: ex[sex], source: 'generated_exception' }

  const last = name[name.length - 1]

  // -ій / -їй ending (Тарас, Андрій, Валерій, Юрій): +ович / replace й→ївна
  if (name.endsWith('ій') || name.endsWith('їй')) {
    if (sex === 'M') return { value: titleCase(name + 'ович'), source: 'generated_regular' } // Тарас→Тарасович
    return { value: titleCase(name.slice(0, -1) + 'ївна'), source: 'generated_regular' }      // Тарас→Сергіївна
  }

  // other -й ending (rare): drop й, +йович / +ївна
  if (last === 'й') {
    const stem = name.slice(0, -1)
    if (sex === 'M') return { value: titleCase(stem + 'йович'), source: 'generated_regular' }
    return { value: titleCase(stem + 'ївна'), source: 'generated_regular' }
  }

  // consonant ending (Іван, Олександр, Володимир, Степан, Тит, Андрон):
  // +ович / +івна. This is the productive regular pattern.
  const vowels = 'аеиіїоуюяєё'
  if (!vowels.includes(last)) {
    if (sex === 'M') return { value: titleCase(name + 'ович'), source: 'generated_regular' }
    return { value: titleCase(name + 'івна'), source: 'generated_regular' }
  }

  // -о / -а / -я endings not in the exceptions table: NOT safely derivable.
  return { value: '', source: 'unresolved' }
}

/**
 * The Chief Engineer's entry point. Given whatever the Reader saw (possibly a
 * fragment) plus the known given name + sex, return the canonical patronymic
 * with provenance + review flag.
 *
 * Priority:
 *   1. A read that is already a complete, well-formed patronymic → keep it
 *      (the document is the source of truth, v5 §7).
 *   2. Otherwise derive from given name + sex (regular or exception).
 *   3. Otherwise unresolved → empty + review_required (never guess).
 */
export function reconcilePatronymic(
  read: string | null | undefined,
  givenName: string | null | undefined,
  sex: Sex,
): PatronymicResult {
  const r = norm(read ?? '')
  if (r && isValidPatronymic(r, sex)) {
    return { value: titleCase(r), source: 'read_valid', review_required: false, reason: 'read is complete and well-formed' }
  }

  const gen = generatePatronymic(givenName ?? '', sex)
  if (gen.value) {
    // Generated values still want a light human glance (the given name itself
    // came from handwriting), but they are high-confidence.
    return {
      value: gen.value,
      source: gen.source,
      review_required: gen.source === 'generated_exception' ? false : true,
      reason: r ? `read "${r}" was a fragment/garbled; reconstructed from given name` : 'no read; reconstructed from given name',
    }
  }

  return { value: '', source: 'unresolved', review_required: true, reason: 'could not validate read nor derive from given name' }
}
