/**
 * I-94 extraction module — CBP Arrival/Departure record.
 *
 * Source: https://i94.cbp.dhs.gov — printout or screenshot.
 *
 * The I-94 is a non-standard layout document (CBP changes formats), so
 * we anchor extraction to labelled keywords rather than positional zones:
 *
 *   "Admission (I-94) Number"          → 11-digit identifier
 *   "Class of Admission" / "COA"       → e.g. "UH" (Uniting for Ukraine parolee),
 *                                              "B2" (visitor), "F1" (student)
 *   "Date of Entry" / "Most Recent…"   → MM/DD/YYYY
 *   "Admit Until Date" / "Admit Until" → MM/DD/YYYY or "D/S"
 *
 * Reuse: lib/ocr/types for OcrResult shape. No external library needed.
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'

const I94_MODULE = 'i94' as const

// MM/DD/YYYY → YYYY-MM-DD (ISO for TPSAnswers)
function usDateToIso(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

// CBP I-94 printouts often show dates as "2022 September 09" or
// "2022 Sep 09". Normalize to MM/DD/YYYY so the rest of the pipeline
// (which only knows US date) keeps working unchanged.
const MONTHS_LONG: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
  aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
}

function yyyyMonthDdToUs(s: string): string | null {
  // "2022 September 09" or "2022 Sep 9" — case-insensitive.
  const m = s.match(/\b(\d{4})\s+([A-Za-z]{3,9})\s+(\d{1,2})\b/)
  if (!m) return null
  const mm = MONTHS_LONG[m[2].toLowerCase()]
  if (!mm) return null
  const dd = m[3].padStart(2, '0')
  return `${mm}/${dd}/${m[1]}`
}

// Try MM/DD/YYYY first (whitelisted by valuePattern), fall back to
// YYYY Month DD if the caller passes a raw line.
function anyDateToUs(s: string): string | null {
  const us = s.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
  if (us) return us[1]
  return yyyyMonthDdToUs(s)
}

interface I94Options {
  document_id: string
}

/**
 * Like findLabelledValue, but takes a free predicate over line text
 * instead of an array of patterns. Lets the caller compose positive
 * AND negative checks (e.g. matches "Date of Entry" AND NOT contains
 * "until") so anchors stay strictly disjoint.
 */
function findLabelledValueStrict(
  ocr: OcrResult,
  labelPredicate: (text: string) => boolean,
  valuePattern: RegExp,
): { value: string; lineId: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null {
  for (let i = 0; i < ocr.lines.length; i++) {
    const line = ocr.lines[i]
    if (!labelPredicate(line.text)) continue
    const sameLine = line.text.match(valuePattern)
    if (sameLine) {
      return {
        value: sameLine[1] ?? sameLine[0],
        lineId: line.id,
        bbox: line.bbox,
        confidence: line.confidence ?? null,
      }
    }
    const next = ocr.lines[i + 1]
    if (next) {
      const nextLine = next.text.match(valuePattern)
      if (nextLine) {
        // Sanity: the next-line value cannot itself carry a different
        // strict label (e.g. don't let "Date of Entry:" steal the
        // value sitting on the next line if that next line is actually
        // "Admit Until Date: 09/07/2024").
        if (labelPredicate(next.text) || /until/i.test(next.text)) {
          continue
        }
        return {
          value: nextLine[1] ?? nextLine[0],
          lineId: next.id,
          bbox: next.bbox,
          confidence: next.confidence ?? null,
        }
      }
    }
  }
  return null
}

/**
 * Search OcrResult for a labelled value. Returns the first match found
 * anywhere in the document text along with the line that contained it
 * (for bbox provenance).
 */
function findLabelledValue(
  ocr: OcrResult,
  labelPatterns: RegExp[],
  valuePattern: RegExp,
): { value: string; lineId: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null {
  // Build full text with line metadata so we can backtrack to bbox.
  // Strategy: look in each line; if line contains label, try to extract
  // value either from same line or next line.
  for (let i = 0; i < ocr.lines.length; i++) {
    const line = ocr.lines[i]
    if (!labelPatterns.some((p) => p.test(line.text))) continue
    // Same-line value first
    const sameLine = line.text.match(valuePattern)
    if (sameLine) {
      return {
        value: sameLine[1] ?? sameLine[0],
        lineId: line.id,
        bbox: line.bbox,
        confidence: line.confidence ?? null,
      }
    }
    // Next-line value (CBP printouts often put label above value)
    const next = ocr.lines[i + 1]
    if (next) {
      const nextLine = next.text.match(valuePattern)
      if (nextLine) {
        return {
          value: nextLine[1] ?? nextLine[0],
          lineId: next.id,
          bbox: next.bbox,
          confidence: next.confidence ?? null,
        }
      }
    }
  }
  return null
}

export function runI94Module(ocr: OcrResult, opts: I94Options): TpsModuleResult {
  const fields: TpsExtractedField[] = []
  const warnings: string[] = []
  const manual_review_reasons: string[] = []

  const base = {
    extraction_source: 'ocr_keyword' as const,
    source_document_id: opts.document_id,
    language_layer: 'mixed' as const,
    user_corrected: false,
  }

  // ── 1. Admission (I-94) Number ──────────────────────────────────────────
  // Modern CBP format: 9 digits + letter + digit (e.g. 123456789A1).
  // Legacy format: 11 digits. Both are 11 chars total.
  // Try modern alphanumeric first (more specific), then legacy numeric.
  const admLabels = [
    /admission\s*\(\s*[I1]\s*[-\s]?\s*94\s*\)\s*(?:record\s*)?number/i,
    /[I1]\s*[-\s]?\s*94\s*(?:record\s*)?number/i,
    /\badmission\s+(?:record\s+)?number\b/i,
    /\brecord\s+number\b/i,
    /\b[I1]\s*[-\s]?\s*94\s*#/i,
  ]
  const adm =
    findLabelledValue(ocr, admLabels, /\b(\d{9}[A-Z]\d)\b/) ??   // modern: 9d+letter+d
    findLabelledValue(ocr, admLabels, /\b(\d{11})\b/)              // legacy: 11 digits
  if (adm) {
    fields.push({
      ...base,
      field: 'i94_admission_number',
      raw_value: adm.value,
      normalized_value: adm.value,
      source_zone: 'i94_admission_number',
      bbox: adm.bbox,
      confidence: adm.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: [adm.value.match(/\d{9}[A-Z]\d/) ? 'i94_modern_alphanumeric' : 'i94_legacy_11_digits'],
      failures: [],
    })
  } else {
    // Fallback: search for an unlabelled I-94-shaped number in the first 20 lines
    // (header area of CBP printouts). Lower confidence, requires review.
    let fallbackAdm: { value: string; lineId: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null = null
    for (let i = 0; i < Math.min(ocr.lines.length, 20); i++) {
      const line = ocr.lines[i]
      const modern = line.text.match(/\b(\d{9}[A-Z]\d)\b/)
      const legacy = line.text.match(/\b(\d{11})\b/)
      const match = modern ?? legacy
      if (match) {
        fallbackAdm = {
          value: match[1],
          lineId: line.id,
          bbox: line.bbox,
          confidence: (line.confidence ?? 0.5) * 0.8, // discount for no label
        }
        break
      }
    }
    if (fallbackAdm) {
      fields.push({
        ...base,
        field: 'i94_admission_number',
        raw_value: fallbackAdm.value,
        normalized_value: fallbackAdm.value,
        source_zone: 'i94_admission_number_fallback',
        bbox: fallbackAdm.bbox,
        confidence: fallbackAdm.confidence,
        review_required: true, // no label context = user must verify
        ocr_word_ids: [],
        passes: ['i94_admission_number_fallback_header'],
        failures: [],
      })
      warnings.push('I-94 admission number found in header area without label — flagged for review.')
    } else {
      warnings.push('I-94 admission number not detected.')
    }
  }

  // ── 2. Class of Admission ─────────────────────────────────────────────────
  // CBP classes: 1-3 alphanumeric (e.g. UH, B2, F1, K3). Allow optional
  // dash like B-2 / F-1.
  const coa = findLabelledValue(
    ocr,
    [/class\s*of\s*admission/i, /\bCOA\b/i, /admission\s*class/i],
    /\b([A-Z]{1,2}[-\s]?[0-9]?[A-Z]?)\b/,
  )
  if (coa) {
    const normalized = coa.value.replace(/[-\s]/g, '').toUpperCase()
    fields.push({
      ...base,
      field: 'i94_class_of_admission',
      raw_value: coa.value,
      normalized_value: normalized,
      source_zone: 'i94_coa',
      bbox: coa.bbox,
      confidence: coa.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['i94_coa_present'],
      failures: [],
    })
  } else {
    warnings.push('I-94 Class of Admission not detected.')
  }

  // ── 3. Date of Entry ──────────────────────────────────────────────────────
  //
  // STRICT anchors per T3PS_ROBUST_OCR spec — only match label lines that
  // explicitly say "Date of Entry" (or its variants). NEVER match lines
  // containing the word "until" — that's a different field.
  //
  // CBP's web printout uses "2022 September 09" (YYYY Month DD); the
  // travel-history table uses "MM/DD/YYYY". Both accepted.
  const ENTRY_LABEL_PATTERNS = [
    /(?:most\s*recent\s*)?date\s*of\s*(?:entry|admission)/i,
    /admit(?:ted)?\s*on/i,
  ]
  const isEntryLabel = (text: string): boolean =>
    ENTRY_LABEL_PATTERNS.some((p) => p.test(text)) && !/until/i.test(text)

  const entry =
    findLabelledValueStrict(ocr, isEntryLabel, /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ??
    findLabelledValueStrict(ocr, isEntryLabel, /\b(\d{4}\s+[A-Za-z]{3,9}\s+\d{1,2})\b/)
  if (entry) {
    const usForm = anyDateToUs(entry.value) ?? entry.value
    const iso = usDateToIso(usForm)
    fields.push({
      ...base,
      field: 'last_entry_date',
      raw_value: entry.value,
      normalized_value: iso,
      source_zone: 'i94_date_of_entry',
      bbox: entry.bbox,
      confidence: entry.confidence,
      review_required: !iso,
      ocr_word_ids: [],
      passes: iso ? ['us_date_to_iso'] : [],
      failures: iso ? [] : ['date_parse_failed'],
    })
  } else {
    warnings.push('I-94 Date of Entry not detected.')
  }

  // ── 4. Admit Until ────────────────────────────────────────────────────────
  //
  // STRICT anchor: require the word "until" in the label. This is the only
  // CBP field that uses it, so it's a positive disambiguator. Accept
  // MM/DD/YYYY, "YYYY Month DD" (CBP web format), or "D/S" (duration of
  // status).
  const isAdmitUntilLabel = (text: string): boolean =>
    /admit\s*until/i.test(text)

  const admitUntilDate =
    findLabelledValueStrict(ocr, isAdmitUntilLabel, /\b(\d{1,2}\/\d{1,2}\/\d{4}|D\/S)\b/) ??
    findLabelledValueStrict(ocr, isAdmitUntilLabel, /\b(\d{4}\s+[A-Za-z]{3,9}\s+\d{1,2})\b/)
  if (admitUntilDate) {
    const isDS = admitUntilDate.value === 'D/S'
    const usForm = isDS ? null : (anyDateToUs(admitUntilDate.value) ?? admitUntilDate.value)
    const iso = !usForm ? null : usDateToIso(usForm)
    fields.push({
      ...base,
      field: 'i94_admit_until',
      raw_value: admitUntilDate.value,
      normalized_value: iso ?? (isDS ? 'D/S' : usForm ?? admitUntilDate.value),
      source_zone: 'i94_admit_until',
      bbox: admitUntilDate.bbox,
      confidence: admitUntilDate.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: isDS ? ['admit_until_ds'] : iso ? ['us_date_to_iso'] : [],
      failures: [],
    })
  }

  // ── 5. Name extraction (cross-check with passport) ─────────────────────
  // CBP I-94 printouts have labelled name fields. These are cross-checks
  // (passport is authoritative), but extracting them pushes field count
  // above the Brain threshold, avoiding unnecessary AI calls.
  //
  // Use NEXT-LINE-ONLY strategy for names: label on one line, value on next.
  // Same-line extraction would catch the label text itself ("First" from
  // "First (Given) Name").
  const LAST_NAME_LABELS = [/\blast\s*(?:[\/\(]\s*sur)?name/i, /\bsurname/i, /\bfamily\s*name/i]
  const FIRST_NAME_LABELS = [/\bfirst\s*(?:[\/\(]\s*given)?/i, /\bgiven\s*name/i]
  const NAME_VALUE = /^([A-Z][A-Z\s'-]{1,30})$/

  for (let i = 0; i < ocr.lines.length - 1; i++) {
    const line = ocr.lines[i]
    const next = ocr.lines[i + 1]
    if (!next) continue
    const nextTrimmed = next.text.trim()
    if (!NAME_VALUE.test(nextTrimmed) || nextTrimmed.length < 2) continue

    if (LAST_NAME_LABELS.some((p) => p.test(line.text)) && !fields.some((f) => f.field === 'family_name')) {
      fields.push({
        ...base,
        field: 'family_name',
        raw_value: next.text,
        normalized_value: nextTrimmed.replace(/\s+/g, ' '),
        source_zone: 'i94_name_block',
        bbox: next.bbox,
        confidence: next.confidence ?? null,
        review_required: false,
        ocr_word_ids: [],
        passes: ['i94_family_name_label_match'],
        failures: [],
      })
    }
    if (FIRST_NAME_LABELS.some((p) => p.test(line.text)) && !fields.some((f) => f.field === 'given_name')) {
      fields.push({
        ...base,
        field: 'given_name',
        raw_value: next.text,
        normalized_value: nextTrimmed.replace(/\s+/g, ' '),
        source_zone: 'i94_name_block',
        bbox: next.bbox,
        confidence: next.confidence ?? null,
        review_required: false,
        ocr_word_ids: [],
        passes: ['i94_given_name_label_match'],
        failures: [],
      })
    }
  }

  // ── 6. Date of Birth ──────────────────────────────────────────────────────
  const dobLabels = [/\bdate\s*of\s*birth\b/i, /\bdob\b/i, /\bbirth\s*date\b/i]
  const dob =
    findLabelledValue(ocr, dobLabels, /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ??
    findLabelledValue(ocr, dobLabels, /\b(\d{4}\s+[A-Za-z]{3,9}\s+\d{1,2})\b/)
  if (dob) {
    const usForm = anyDateToUs(dob.value) ?? dob.value
    const iso = usDateToIso(usForm)
    if (iso) {
      fields.push({
        ...base,
        field: 'dob',
        raw_value: dob.value,
        normalized_value: iso,
        source_zone: 'i94_dob',
        bbox: dob.bbox,
        confidence: dob.confidence,
        review_required: false,
        ocr_word_ids: [],
        passes: ['i94_dob_date_parsed'],
        failures: [],
      })
    }
  }

  // ── 7. Country of Citizenship ─────────────────────────────────────────────
  const country = findLabelledValue(
    ocr,
    [/\bcountry\s*of\s*(?:citizen|national)/i, /\bcitizenship\b/i, /\bnationality\b/i],
    /\b([A-Z][A-Za-z\s]{2,25})\b/,
  )
  if (country) {
    let normalized = country.value.trim()
    // P2 FIX: reject values that ARE the label text itself. The regex
    // captures "Country of Citizenship" from same-line match because
    // the value pattern is too broad. If the value looks like a label,
    // search the next line for the actual country name.
    if (/\b(?:country|citizenship|nationality|of)\b/i.test(normalized)) {
      let foundNext = false
      for (let i = 0; i < ocr.lines.length; i++) {
        if (ocr.lines[i].id !== country.lineId) continue
        const next = ocr.lines[i + 1]
        if (next) {
          const m = next.text.trim().match(/^([A-Z][A-Za-z\s]{2,25})$/)
          if (m && !/\b(?:country|citizenship|nationality|of|class|admission)\b/i.test(m[1])) {
            normalized = m[1].trim()
            foundNext = true
          }
        }
        break
      }
      if (!foundNext) normalized = '' // give up
    }
    if (normalized.length >= 3) {
      fields.push({
        ...base,
        field: 'country_of_citizenship',
        raw_value: country.value,
        normalized_value: normalized,
        source_zone: 'i94_citizenship',
        bbox: country.bbox,
        confidence: country.confidence,
        review_required: false,
        ocr_word_ids: [],
        passes: ['i94_citizenship_label_match'],
        failures: [],
      })
    }
  }

  // ── 8. Sanity guard: last_entry_date should NEVER equal admit_until ─────
  // If they did match, our anchor parser collapsed two different CBP fields
  // onto the same source date — this is a strong signal something is wrong
  // with the OCR layout. We don't drop the values (they may legitimately
  // match in rare cases like an expiring parolee re-entry), but we mark
  // both as requires_review so the wizard's amber 'verify' badge fires
  // and the user looks twice before generating the PDF.
  const entryField = fields.find((f) => f.field === 'last_entry_date')
  const admitField = fields.find((f) => f.field === 'i94_admit_until')
  if (
    entryField && admitField &&
    entryField.normalized_value && admitField.normalized_value &&
    entryField.normalized_value === admitField.normalized_value
  ) {
    entryField.review_required = true
    admitField.review_required = true
    entryField.failures = [...(entryField.failures ?? []), 'collision_with_admit_until']
    admitField.failures = [...(admitField.failures ?? []), 'collision_with_last_entry_date']
    warnings.push('I-94 last_entry_date matches admit_until — verify manually.')
  }

  // ── 9. Port / Place of Entry ──────────────────────────────────────────────
  // CBP I-94 shows "Port of Entry" or "Arrival Port", e.g. "LOS ANGELES, CA"
  // Added: "port of last entry", "place of entry", "entry port", "last entry port"
  // Value pattern extended: apostrophes, hyphens, full state names allowed
  const portOfEntry = findLabelledValue(
    ocr,
    [
      /port\s*of\s*(?:last\s*)?entry/i,
      /arrival\s*port/i,
      /port\s*of\s*arrival/i,
      /entered\s*at/i,
      /place\s*of\s*(?:last\s*)?entry/i,
      /entry\s*port/i,
      /last\s*entry\s*port/i,
    ],
    /([A-Z][A-Za-z\s.'"\-]+,\s*[A-Z]{2,})/,
  )
  if (portOfEntry) {
    fields.push({
      ...base,
      field: 'place_of_last_entry',
      raw_value: portOfEntry.value,
      normalized_value: portOfEntry.value.trim(),
      source_zone: 'i94_port_of_entry',
      bbox: portOfEntry.bbox,
      confidence: portOfEntry.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['i94_port_of_entry_present'],
      failures: [],
    })
  }

  const matched = fields.length >= 2  // need at least admission# + COA OR entry date
  if (!matched) {
    return {
      module: I94_MODULE,
      matched: false,
      match_reason: 'too_few_i94_anchors_matched',
      fields: [],
      warnings: ['Document does not look like an I-94 record. Tried admission#, COA, date of entry.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  return {
    module: I94_MODULE,
    matched: true,
    match_reason: 'i94_anchors_matched',
    fields,
    warnings,
    manual_review_required: manual_review_reasons.length > 0,
    manual_review_reasons,
  }
}
