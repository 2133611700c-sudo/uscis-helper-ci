/**
 * docintel/dates/dateRoleGuard — deterministic safety on a document's DATES.
 *
 * A certificate carries several dates with DIFFERENT roles (date of birth, date of
 * issue, registry-record date). Two real failures (observed on the owner's docs +
 * required by the project name-reading spec):
 *   1. ROLE CONFLATION — the model copies one date into two role fields
 *      (e.g. dob == date_of_issue). The reads are then untrustworthy.
 *   2. SEQUENCE CONFLICT — issue date earlier than birth date (impossible).
 *
 * This raises review on the affected fields with a reason code. It NEVER changes a
 * value and NEVER lowers an existing review flag — pure guard, no AI, no flag.
 */

export interface DateGuardField {
  field: string
  kind?: string
  value?: string | null
  review_required?: boolean
  review_reasons?: string[]
}

const BIRTH = /(^|_)(dob|date_of_birth|birth_date)(_|$)/i
const ISSUE = /(^|_)(date_of_issue|issue_date)(_|$)/i

/** A date field — by name (the live `kind` is the source, not the data type). */
function isDate(field: string, kind?: string): boolean {
  if (kind === 'date') return true
  const f = (field || '').toLowerCase()
  return f === 'dob' || /(?:^|_)date(?:_|$)/.test(f) || f.includes('date_of')
}

/** Parse ISO or MM/DD/YYYY or DD.MM.YYYY to a comparable yyyymmdd number, or null. */
function toComparable(v: string): number | null {
  const t = (v || '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return +`${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) { // MM/DD/YYYY if first ≤12 & second >12, else DD.MM.YYYY
    const a = +m[1], b = +m[2]
    const month = a <= 12 && b > 12 ? a : b
    const day = a <= 12 && b > 12 ? b : a
    return +`${m[3]}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
  }
  return null
}

export interface DateGuardOutcome<T extends DateGuardField> {
  fields: T[]
  conflicts: string[] // reason codes raised (PII-free)
}

/**
 * Apply role-conflation + sequence checks to a document's date fields.
 * Only raises review; never edits values.
 */
export function applyDateRoleGuard<T extends DateGuardField>(fields: T[]): DateGuardOutcome<T> {
  const dateFields = fields.filter((f) => isDate(f.field, f.kind) && (f.value ?? '').trim())
  if (dateFields.length < 2) return { fields, conflicts: [] }

  const flag = new Set<string>()        // field names to force review
  const conflicts = new Set<string>()

  // 1. Role conflation: identical value across two different date roles.
  const byValue = new Map<string, T[]>()
  for (const f of dateFields) {
    const v = (f.value ?? '').trim()
    byValue.set(v, [...(byValue.get(v) ?? []), f])
  }
  for (const group of byValue.values()) {
    if (group.length > 1) {
      group.forEach((f) => flag.add(f.field))
      conflicts.add('date_role_conflict')
    }
  }

  // 2. Sequence: issue date must not precede birth date.
  const birth = dateFields.find((f) => BIRTH.test(f.field))
  const issue = dateFields.find((f) => ISSUE.test(f.field))
  if (birth && issue) {
    const b = toComparable(birth.value ?? ''), i = toComparable(issue.value ?? '')
    if (b !== null && i !== null && i < b) {
      flag.add(birth.field); flag.add(issue.field)
      conflicts.add('date_sequence_conflict')
    }
  }

  if (flag.size === 0) return { fields, conflicts: [] }
  const out = fields.map((f) => flag.has(f.field)
    ? { ...f, review_required: true, review_reasons: [...(f.review_reasons ?? []), ...[...conflicts]] }
    : f)
  return { fields: out, conflicts: [...conflicts] }
}
