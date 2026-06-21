/**
 * applyDateEnsemble — field-level glue for the cross-engine date check.
 *
 * For each DATE field the primary reader (Gemini) produced, reconcile it against
 * the date candidates a SECOND engine (Google Vision handwriting OCR) found in
 * the same image. Proven on a real handwritten birth cert: Gemini misreads the
 * month, Vision reads it correctly — so a disagreement is a HIGH-VALUE signal.
 *
 * Conservative by contract: it ONLY RAISES review (never lowers it) and never
 * overwrites the primary value. On disagreement it forces review + records the
 * reason + attaches both candidate readings for the review UI / human to choose.
 * No engine I/O here — the caller passes the second engine's full text in.
 */
import { parseDateText, reconcileDate, extractDateCandidatesFromText } from './dateReconcile'
export { extractDateCandidatesFromText } from './dateReconcile'

export interface EnsembleField {
  field: string
  kind?: string
  value?: string | null
  raw_cyrillic?: string | null
  review_required?: boolean
  review_reasons?: string[]
  /** populated on disagreement: the second engine's reading of this date. */
  ensemble_candidate?: string | null
}

/**
 * A date field — detected by NAME, not by `kind`. In the live response `kind`
 * carries the SOURCE ('ai_vision'), not the data type, so a kind-based check
 * never matched (the bug that silenced the ensemble). Names are the schema's
 * own keys: dob, date_of_birth, date_of_issue, date_of_marriage, date_of_divorce…
 */
export function isDateFieldName(field: string, kind?: string): boolean {
  if (kind === 'date') return true
  const f = (field || '').toLowerCase()
  return f === 'dob' || /(?:^|_)date(?:_|$)/.test(f) || f.includes('date_of')
}

export interface DateEnsembleOutcome<T extends EnsembleField> {
  fields: T[]
  applied: boolean
  /** field names where the two engines disagreed on the date (PII-free). */
  disagreements: string[]
}

/** The reading the primary engine offers for a date field (words preferred). */
function primaryDateText(f: EnsembleField): string {
  // raw_cyrillic carries the month WORD ("28 липня 1986"); value is the ISO/derived form.
  return (f.raw_cyrillic && /\p{L}/u.test(f.raw_cyrillic) ? f.raw_cyrillic : f.value) ?? ''
}

/**
 * Cross-check every date field against the second engine's OCR text.
 * @param fields    primary-engine fields (date fields identified by kind==='date')
 * @param secondEngineText  full OCR text from the second engine (e.g. Vision raw_text)
 */
export function applyDateEnsemble<T extends EnsembleField>(
  fields: T[],
  secondEngineText: string,
  secondSource = 'google_vision',
): DateEnsembleOutcome<T> {
  const visionDates = extractDateCandidatesFromText(secondEngineText)
  if (visionDates.length === 0) return { fields, applied: false, disagreements: [] }

  const disagreements: string[] = []
  const out = fields.map((f) => {
    if (!isDateFieldName(f.field, f.kind)) return f
    const primaryText = primaryDateText(f)
    const primary = parseDateText(primaryText)
    if (primary.year == null && primary.month == null && primary.day == null) return f

    // Pick the second-engine candidate that shares the most components with the
    // primary reading (so we compare the SAME date, not the issue-date vs dob).
    let best: { text: string; shared: number } | null = null
    for (const vt of visionDates) {
      const p = parseDateText(vt)
      const shared =
        (p.year != null && p.year === primary.year ? 1 : 0) +
        (p.day != null && p.day === primary.day ? 1 : 0) +
        (p.month != null && p.month === primary.month ? 1 : 0)
      if (!best || shared > best.shared) best = { text: vt, shared }
    }
    if (!best) return f

    const rec = reconcileDate([
      { source: 'gemini', text: primaryText },
      { source: secondSource, text: best.text },
    ])
    // The second engine read the SAME region (we crop the date area), so any
    // difference is a real signal — surface it. On handwritten dates the engines
    // often disagree with NO shared component (Gemini gets the year, Vision the
    // month/day) — requiring a shared anchor wrongly suppressed exactly that case.
    const bestParsed = parseDateText(best.text)
    const secondIsComplete = bestParsed.day != null || bestParsed.month != null
    if (!rec.agree && secondIsComplete) {
      disagreements.push(f.field)
      return {
        ...f,
        review_required: true,
        review_reasons: [...(f.review_reasons ?? []), ...rec.reasonCodes, 'date_ensemble_disagreement'],
        ensemble_candidate: best.text,
      }
    }
    return f
  })

  return { fields: out, applied: true, disagreements }
}
