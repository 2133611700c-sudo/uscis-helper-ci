/**
 * EAD card extraction module — USCIS Employment Authorization Document.
 *
 * Source: physical card layout (front side photographed).
 *
 * The EAD card has stable USCIS-controlled labels:
 *   "USCIS#" or "USCIS Number"   → A-number style (9 digits)
 *   "Card#"                       → 13 char alphanumeric card serial
 *   "Category" / "Cat."           → e.g. "A12", "C19", "C8"
 *   "Card Expires"                → MM/DD/YYYY
 *   "Surname / Last Name"         → printed surname
 *   "Given Name"                  → printed given names
 *
 * Reuse: lib/ocr/types only. No external library needed.
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'
import { formatLatinName } from '@uscis-helper/knowledge'

const EAD_MODULE = 'ead' as const

function usDateToIso(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

interface EadOptions {
  document_id: string
}

function findValue(
  ocr: OcrResult,
  labelPatterns: RegExp[],
  valuePattern: RegExp,
): { value: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null {
  for (let i = 0; i < ocr.lines.length; i++) {
    const line = ocr.lines[i]
    if (!labelPatterns.some((p) => p.test(line.text))) continue
    const same = line.text.match(valuePattern)
    if (same) {
      return { value: same[1] ?? same[0], bbox: line.bbox, confidence: line.confidence ?? null }
    }
    const next = ocr.lines[i + 1]
    if (next) {
      const m = next.text.match(valuePattern)
      if (m) {
        return { value: m[1] ?? m[0], bbox: next.bbox, confidence: next.confidence ?? null }
      }
    }
  }
  return null
}

export function runEadModule(ocr: OcrResult, opts: EadOptions): TpsModuleResult {
  const fields: TpsExtractedField[] = []
  const warnings: string[] = []
  const manual_review_reasons: string[] = []

  const base = {
    extraction_source: 'ocr_keyword' as const,
    source_document_id: opts.document_id,
    language_layer: 'latin' as const,
    user_corrected: false,
  }

  // 1. USCIS# — A-number (9 digits) or sometimes 9 digits without prefix
  const uscisNum = findValue(
    ocr,
    [/USCIS\s*#/i, /USCIS\s*Number/i, /\bA[-\s]?Number\b/i],
    /\b(\d{9})\b/,
  )
  if (uscisNum) {
    fields.push({
      ...base,
      field: 'a_number',
      raw_value: uscisNum.value,
      normalized_value: uscisNum.value,
      source_zone: 'ead_uscis_number',
      bbox: uscisNum.bbox,
      confidence: uscisNum.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['ead_uscis_number_9_digits'],
      failures: [],
    })
  }

  // 2. Category — e.g. A12, C19, C8 (1 letter + 1-2 digits, optional parens)
  const cat = findValue(
    ocr,
    [/^category$/i, /\bCategory\b/i, /\bCat\.?\s*$/i],
    /\b([AC]\d{1,2}[A-Z]?)\b/,
  )
  if (cat) {
    fields.push({
      ...base,
      field: 'ead_category_on_card',
      raw_value: cat.value,
      normalized_value: cat.value.toUpperCase(),
      source_zone: 'ead_category',
      bbox: cat.bbox,
      confidence: cat.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['ead_category_format'],
      failures: [],
    })
  } else {
    warnings.push('EAD Category code not detected on the card.')
  }

  // 3. Card Expires
  const exp = findValue(
    ocr,
    [/card\s*expires/i, /\bexpires\b/i, /\bvalid\s*through\b/i],
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  )
  if (exp) {
    const iso = usDateToIso(exp.value)
    const expired = iso ? iso < new Date().toISOString().slice(0, 10) : false
    fields.push({
      ...base,
      field: 'ead_expiration_date',
      raw_value: exp.value,
      normalized_value: iso,
      source_zone: 'ead_card_expires',
      bbox: exp.bbox,
      confidence: exp.confidence,
      review_required: expired,
      ocr_word_ids: [],
      passes: iso ? ['us_date_to_iso'] : [],
      failures: expired ? ['ead_expired'] : iso ? [] : ['date_parse_failed'],
    })
    if (expired) {
      manual_review_reasons.push('ead_expired_card')
    }
  } else {
    warnings.push('EAD Card Expires date not detected.')
  }

  // 4. Surname
  const surname = findValue(
    ocr,
    [/surname\s*\/\s*last\s*name/i, /^surname$/i, /\bLast\s*Name\b/i],
    /\b([A-Z][A-Z\s'-]{1,40})\b/,
  )
  if (surname) {
    fields.push({
      ...base,
      field: 'family_name',
      raw_value: surname.value.trim(),
      normalized_value: formatLatinName(surname.value),
      source_zone: 'ead_surname',
      bbox: surname.bbox,
      confidence: surname.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['ead_surname_label_found'],
      failures: [],
    })
  }

  // 5. Given Name
  const given = findValue(
    ocr,
    [/given\s*name/i, /\bFirst\s*Name\b/i],
    /\b([A-Z][A-Z\s'-]{1,40})\b/,
  )
  if (given) {
    fields.push({
      ...base,
      field: 'given_name',
      raw_value: given.value.trim(),
      normalized_value: formatLatinName(given.value),
      source_zone: 'ead_given_name',
      bbox: given.bbox,
      confidence: given.confidence,
      review_required: false,
      ocr_word_ids: [],
      passes: ['ead_given_name_label_found'],
      failures: [],
    })
  }

  // P1 FIX: EAD OCR sometimes duplicates family_name as given_name
  // (both extracted as the same ALL-CAPS surname). If they match,
  // drop given_name so Brain can fill the correct value. Passport
  // identity authority would override anyway, but standalone EAD
  // users (no passport) would get wrong data without this guard.
  const famField = fields.find((f) => f.field === 'family_name')
  const givField = fields.find((f) => f.field === 'given_name')
  if (famField && givField &&
    famField.normalized_value?.toLowerCase().trim() === givField.normalized_value?.toLowerCase().trim()) {
    const idx = fields.indexOf(givField)
    if (idx >= 0) fields.splice(idx, 1)
    warnings.push('EAD given_name identical to family_name — removed to avoid data corruption. Brain or manual entry needed.')
  }

  const matched = fields.length >= 2  // need at least category + expiry OR name fields
  if (!matched) {
    return {
      module: EAD_MODULE,
      matched: false,
      match_reason: 'too_few_ead_anchors_matched',
      fields: [],
      warnings: ['Document does not look like an EAD card. Tried USCIS#, Category, Card Expires, Surname.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  return {
    module: EAD_MODULE,
    matched: true,
    match_reason: 'ead_anchors_matched',
    fields,
    warnings,
    manual_review_required: manual_review_reasons.length > 0,
    manual_review_reasons,
  }
}
