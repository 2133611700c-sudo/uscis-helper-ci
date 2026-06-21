/**
 * I-797 / I-797C Notice of Action — rule extraction module.
 *
 * Extracts from USCIS approval/receipt notices:
 *   - receipt_number (3-letter prefix + 10 digits, e.g. IOE0912345678)
 *   - a_number (A-Number, 9 digits)
 *   - notice_date / received_date
 *   - notice_type (Receipt/Approval/Transfer)
 *   - case_type (I-821/I-765/etc.)
 *   - family_name / given_name (cross-check only)
 *
 * FORBIDDEN: passport_number, i94_admission_number, last_entry_date,
 *            status_at_last_entry, driver_license fields.
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'

export interface I797Options {
  document_id: string
}

// ── Local labelled-value extraction helper ──────────────────────────────
// Same pattern as other modules. Checks same-line then next-line after label.
function findLabelledValue(
  ocr: OcrResult,
  labelPatterns: RegExp[],
  valuePattern: RegExp,
): { value: string; lineId: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null {
  for (const line of ocr.lines) {
    for (const lp of labelPatterns) {
      if (!lp.test(line.text)) continue
      // Same-line: value after label
      const sameMatch = line.text.match(valuePattern)
      if (sameMatch) {
        return { value: sameMatch[1], lineId: line.id, bbox: line.bbox, confidence: line.confidence ?? null }
      }
      // Next-line: scan up to 2 lines after label
      const idx = ocr.lines.indexOf(line)
      for (let d = 1; d <= 2 && idx + d < ocr.lines.length; d++) {
        const next = ocr.lines[idx + d]
        const nextMatch = next.text.match(valuePattern)
        if (nextMatch) {
          return { value: nextMatch[1], lineId: next.id, bbox: next.bbox, confidence: next.confidence ?? null }
        }
      }
    }
  }
  return null
}

// ── US date helpers ─────────────────────────────────────────────────────
function usDateToIso(usDate: string): string | null {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// ── Receipt number patterns ─────────────────────────────────────────────
// Format: 3-letter prefix + 10 digits. Known prefixes:
// IOE (online), EAC (Vermont), WAC (California), LIN (Nebraska),
// SRC (Texas), MSC (Missouri), NBC (National Benefits Center)
const RECEIPT_PREFIXES = '(?:IOE|EAC|WAC|LIN|SRC|MSC|NBC|YSC)'
const RECEIPT_NUMBER_RE = new RegExp(`\\b(${RECEIPT_PREFIXES}\\d{10})\\b`)

export function runI797Module(ocr: OcrResult, opts: I797Options): TpsModuleResult {
  const fields: TpsExtractedField[] = []
  const warnings: string[] = []

  const base = {
    extraction_source: 'ocr_keyword' as const,
    source_document_id: opts.document_id,
    language_layer: 'latin' as const,
    user_corrected: false,
  }

  // ── 1. Receipt Number (13 chars: 3 letters + 10 digits) ────────────────
  const receipt = findLabelledValue(
    ocr,
    [/\breceipt\s*(?:number|#|no\.?)\b/i, /\bcase\s*(?:number|#|no\.?)\b/i],
    RECEIPT_NUMBER_RE,
  )
  if (receipt) {
    fields.push({
      ...base, field: 'receipt_number',
      raw_value: receipt.value, normalized_value: receipt.value,
      source_zone: 'i797_receipt_number', bbox: receipt.bbox,
      confidence: receipt.confidence, review_required: false,
      ocr_word_ids: [], passes: ['i797_receipt_number_labelled'], failures: [],
    })
  } else {
    // Fallback: unlabelled receipt number in first 10 lines
    for (let i = 0; i < Math.min(ocr.lines.length, 10); i++) {
      const m = ocr.lines[i].text.match(RECEIPT_NUMBER_RE)
      if (m) {
        fields.push({
          ...base, field: 'receipt_number',
          raw_value: m[1], normalized_value: m[1],
          source_zone: 'i797_receipt_number_fallback', bbox: ocr.lines[i].bbox,
          confidence: (ocr.lines[i].confidence ?? 0.5) * 0.8,
          review_required: true,
          ocr_word_ids: [], passes: ['i797_receipt_number_header_fallback'], failures: [],
        })
        break
      }
    }
  }

  // ── 2. A-Number ─────────────────────────────────────────────────────────
  const aNum = findLabelledValue(
    ocr,
    [/\ba[\s-]*(?:number|#|no\.?)\b/i, /\balien\s*(?:number|registration|#)\b/i, /\bA#/i],
    /\b[Aa]?\s*(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/,
  )
  if (aNum) {
    const normalized = aNum.value.replace(/[\s-]/g, '')
    if (normalized.length === 9 && /^\d{9}$/.test(normalized)) {
      fields.push({
        ...base, field: 'a_number',
        raw_value: aNum.value, normalized_value: normalized,
        source_zone: 'i797_a_number', bbox: aNum.bbox,
        confidence: aNum.confidence, review_required: false,
        ocr_word_ids: [], passes: ['i797_a_number_labelled'], failures: [],
      })
    }
  }

  // ── 3. Notice Date ─────────────────────────────────────────────────────

  // ── 2b. USCIS Online Account Number (12 digits) ────────────────────────
  const uscisAcct = findLabelledValue(
    ocr,
    [/\buscis\s*(?:online\s*)?account\s*(?:number|#|no\.?)\b/i, /\baccount\s*(?:number|#)\b/i],
    /\b(\d{12})\b/,
  )
  if (uscisAcct) {
    fields.push({
      ...base, field: 'uscis_online_account',
      raw_value: uscisAcct.value, normalized_value: uscisAcct.value,
      source_zone: 'i797_uscis_account', bbox: uscisAcct.bbox,
      confidence: uscisAcct.confidence, review_required: false,
      ocr_word_ids: [], passes: ['i797_uscis_account_labelled'], failures: [],
    })
  }

  // ── 3. Notice Date ─────────────────────────────────────────────────────
  const noticeDate = findLabelledValue(
    ocr,
    [/\bnotice\s*date\b/i, /\bdate\s*of\s*(?:this\s*)?notice\b/i],
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  )
  if (noticeDate) {
    const iso = usDateToIso(noticeDate.value)
    if (iso) {
      fields.push({
        ...base, field: 'notice_date',
        raw_value: noticeDate.value, normalized_value: iso,
        source_zone: 'i797_notice_date', bbox: noticeDate.bbox,
        confidence: noticeDate.confidence, review_required: false,
        ocr_word_ids: [], passes: ['i797_notice_date_parsed'], failures: [],
      })
    }
  }

  // ── 4. Received Date ───────────────────────────────────────────────────
  const receivedDate = findLabelledValue(
    ocr,
    [/\breceived\s*date\b/i, /\bdate\s*received\b/i],
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  )
  if (receivedDate) {
    const iso = usDateToIso(receivedDate.value)
    if (iso) {
      fields.push({
        ...base, field: 'received_date',
        raw_value: receivedDate.value, normalized_value: iso,
        source_zone: 'i797_received_date', bbox: receivedDate.bbox,
        confidence: receivedDate.confidence, review_required: false,
        ocr_word_ids: [], passes: ['i797_received_date_parsed'], failures: [],
      })
    }
  }

  // ── 5. Notice Type (Receipt/Approval/Transfer) ─────────────────────────
  for (const line of ocr.lines) {
    const ntMatch = line.text.match(/\bnotice\s*type\s*[:.]?\s*(receipt|approval|transfer|re-?open|denial)/i)
    if (ntMatch) {
      fields.push({
        ...base, field: 'notice_type',
        raw_value: ntMatch[1], normalized_value: ntMatch[1].toLowerCase(),
        source_zone: 'i797_notice_type', bbox: line.bbox,
        confidence: line.confidence ?? null, review_required: false,
        ocr_word_ids: [], passes: ['i797_notice_type_inline'], failures: [],
      })
      break
    }
  }

  // ── 6. Case/Form Type (e.g. I-821, I-765) ────────────────────────────
  const formType = findLabelledValue(
    ocr,
    [/\bform\s*type\b/i, /\bcase\s*type\b/i, /\bapplication\s*type\b/i, /\bpetition\b/i],
    /\b(I-\d{2,4}[A-Z]?)\b/,
  )
  if (formType) {
    fields.push({
      ...base, field: 'form_type',
      raw_value: formType.value, normalized_value: formType.value.toUpperCase(),
      source_zone: 'i797_form_type', bbox: formType.bbox,
      confidence: formType.confidence, review_required: false,
      ocr_word_ids: [], passes: ['i797_form_type_labelled'], failures: [],
    })
  }

  // ── 7. Applicant name (cross-check only — passport is authoritative) ──
  const LAST_LABELS = [/\blast\s*name/i, /\bsurname/i, /\bfamily\s*name/i, /\bbeneficiary/i]
  const FIRST_LABELS = [/\bfirst\s*name/i, /\bgiven\s*name/i]
  const NAME_RE = /\b([A-Z][A-Z\s'-]{1,30})\b/

  // Next-line strategy (same as I-94 module)
  for (let i = 0; i < ocr.lines.length - 1; i++) {
    const line = ocr.lines[i]
    const next = ocr.lines[i + 1]
    if (!next) continue
    const val = next.text.trim()
    if (!/^[A-Z][A-Z\s'-]{1,30}$/.test(val) || val.length < 2) continue

    if (LAST_LABELS.some(p => p.test(line.text)) && !fields.some(f => f.field === 'family_name')) {
      fields.push({
        ...base, field: 'family_name',
        raw_value: next.text, normalized_value: val.replace(/\s+/g, ' '),
        source_zone: 'i797_name_block', bbox: next.bbox,
        confidence: next.confidence ?? null, review_required: false,
        ocr_word_ids: [], passes: ['i797_family_name_label'], failures: [],
      })
    }
    if (FIRST_LABELS.some(p => p.test(line.text)) && !fields.some(f => f.field === 'given_name')) {
      fields.push({
        ...base, field: 'given_name',
        raw_value: next.text, normalized_value: val.replace(/\s+/g, ' '),
        source_zone: 'i797_name_block', bbox: next.bbox,
        confidence: next.confidence ?? null, review_required: false,
        ocr_word_ids: [], passes: ['i797_given_name_label'], failures: [],
      })
    }
  }

  // ── Match heuristic ───────────────────────────────────────────────────
  // I-797 is identified by presence of receipt number pattern + USCIS notice markers
  const hasReceipt = fields.some(f => f.field === 'receipt_number')
  const hasNoticeMarker = ocr.lines.some(l =>
    /\bnotice\s*of\s*action\b/i.test(l.text) ||
    /\bI-797[A-E]?\b/i.test(l.text) ||
    /\bUSCIS\b/i.test(l.text)
  )
  const matched = hasReceipt || (hasNoticeMarker && fields.length >= 2)

  return {
    module: 'i797',
    matched,
    match_reason: matched
      ? `I-797 detected: ${hasReceipt ? 'receipt number found' : 'notice markers + fields'}`
      : 'No receipt number or sufficient notice markers found',
    fields,
    warnings,
    manual_review_required: false,
    manual_review_reasons: [],
  }
}
