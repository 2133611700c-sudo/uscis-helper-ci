/**
 * U.S. Driver's License / State ID extraction module — REAL_DOC AUDIT R3.
 *
 * Built 2026-05-20 after the DL slot consistently triggered Brain
 * INVALID_JSON in production (DeepSeek appears to refuse JSON output on
 * card content that matches the US-DL safety filter). Even with
 * maxTokens=2500, the model returned an empty completion. We don't
 * control DeepSeek's safety classifier, but we DO control whether DL
 * extraction has to ride on a third party at all.
 *
 * The American DL has a stable, label-anchored layout (CA, NY, FL all
 * follow the AAMVA spec on the visible side). The rule module here
 * matches every field via narrow regex and never calls Brain.
 *
 * Labels recognized:
 *   DL <token>     → dl_number (state license ID)
 *   LN <surname>   → family_name
 *   FN <given>     → given_name
 *   DOB MM/DD/YYYY → dob
 *   SEX M|F|X      → sex
 *   HGT 6'-06"     → height (foot-inches literal)
 *   WGT 231 lb     → weight
 *   EYES BRN       → eye_color (3-letter)
 *   HAIR BRN       → hair_color (3-letter)
 *
 * Address heuristic:
 *   The address is two consecutive lines without an "Address:" label:
 *     line A: street + apartment ("4341 WILLOW BROOK AVE 111")
 *     line B: "CITY, ST ZIP"     ("LOS ANGELES, CA 90029")
 *   We find line B by regex `^[A-Z .'-]+, [A-Z]{2} \d{5}(-\d{4})?$`
 *   and take the preceding line as line A.
 *
 * Output convention:
 *   - family_name / given_name: title-cased Latin.
 *   - us_address_street / us_address_city: title-cased.
 *   - us_address_state: uppercase 2-letter USPS.
 *   - us_address_zip: digits (with optional -NNNN).
 *   - height / weight / eye_color / hair_color: literal as printed.
 *
 * The wizard's identity-conflict guard makes passport authoritative
 * for family_name / given_name / dob / sex regardless of what this
 * module returns. So DL identity fields are fine as cross-reference
 * even if the DL has a slight name variant.
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'

const DL_MODULE = 'dl' as const

// MM/DD/YYYY → YYYY-MM-DD (ISO for TPSAnswers).
function usDateToIso(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

// Same title-case logic as the Brain post-processor, replicated here
// so the rule path doesn't need to share state with documentBrain.ts.
const POSTAL_KEEP_UPPER = new Set([
  'APT', 'PO', 'NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W', 'USA', 'US',
])
function titleCaseToken(tok: string): string {
  if (!tok) return tok
  if (/^[0-9][0-9-]*$/.test(tok)) return tok
  const upper = tok.toUpperCase()
  if (POSTAL_KEEP_UPPER.has(upper)) return upper
  const m = tok.match(/^([\p{L}'’]+)(.*)$/u)
  if (!m) return tok
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + m[2]
}
function titleCaseString(s: string): string {
  return s
    .split(' ')
    .map((seg) =>
      seg.includes('-') ? seg.split('-').map(titleCaseToken).join('-') : titleCaseToken(seg),
    )
    .join(' ')
}

interface DlOptions {
  document_id: string
}

/**
 * Search every line for a regex match. Returns the FIRST match payload.
 */
function findOnAnyLine(
  ocr: OcrResult,
  pattern: RegExp,
): { value: string; bbox: OcrResult['lines'][number]['bbox']; confidence: number | null } | null {
  for (const line of ocr.lines) {
    const m = line.text.match(pattern)
    if (m) {
      return {
        value: m[1] ?? m[0],
        bbox: line.bbox,
        confidence: line.confidence ?? null,
      }
    }
  }
  return null
}

/**
 * Find DL postal address components — flexible, layout-independent.
 *
 * Strategy (T3PS_ROBUST_OCR spec):
 *   1. Find the ZIP code anywhere in the OCR text. ZIP is the most
 *      unambiguous part (always 5 digits, optionally +4).
 *   2. Look immediately to the LEFT of the ZIP for a 2-letter USPS
 *      state code.
 *   3. Look immediately to the LEFT of the state for a city name
 *      (uppercase letters and spaces, ending at comma or line break).
 *   4. Look on the PREVIOUS line (or a few lines back) for the street
 *      address — typically starts with a digit (house number).
 *
 * This works even when:
 *   - the photo is rotated (Vision still emits text in reading order
 *     within each detected paragraph)
 *   - the address spans 1 line, 2 lines, or 3+ lines
 *   - extra whitespace or commas are between tokens
 *   - the line "CITY, ST ZIP" has been split into two lines
 *
 * Returns an object with whatever parts were found, partial OK.
 * Never invents — if a part is missing, leaves it empty.
 */
function findAddressFlexible(ocr: OcrResult): {
  street: string
  city: string
  state: string
  zip: string
} | null {
  // Concatenate all OCR lines into one searchable blob, tracking line
  // boundaries so we can find the street on the preceding line.
  const lines = ocr.lines.map((l) => l.text)
  if (lines.length === 0) return null

  // ZIP regex: 5 digits, optionally followed by -4. Must NOT be part of
  // a longer numeric sequence (DOB, DL number, document ID, etc).
  // Negative lookbehind / lookahead for digits.
  const zipRe = /(?<!\d)(\d{5}(?:-\d{4})?)(?!\d)/g
  // Two-letter USPS state code preceded by space/comma. We don't enforce
  // the full USPS list at this point — any [A-Z]{2} that sits between a
  // city-like token and the ZIP is overwhelmingly the state.
  const stateRe = /\b([A-Z]{2})\b/

  // Iterate all lines looking for a ZIP. For each ZIP hit, try to
  // reconstruct the rest of the address backwards through the line and
  // the preceding lines.
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    let zipMatch: RegExpExecArray | null
    zipRe.lastIndex = 0
    while ((zipMatch = zipRe.exec(line)) !== null) {
      const zip = zipMatch[1]
      const zipStart = zipMatch.index

      // Look before the ZIP in the same line for a state code.
      const beforeZip = line.slice(0, zipStart).trim()
      // The state is the rightmost 2-letter uppercase token before ZIP.
      const stateTokens = Array.from(beforeZip.matchAll(/\b([A-Z]{2})\b/g))
      if (stateTokens.length === 0) continue
      const stateTok = stateTokens[stateTokens.length - 1]
      const state = stateTok[1]
      const stateStart = stateTok.index ?? 0

      // City is what sits between the start of the line (or after a
      // street component) and the state token, trimmed of commas.
      const beforeState = beforeZip.slice(0, stateStart).replace(/[,\s]+$/, '').trim()
      let city = ''
      let street = ''
      if (beforeState && /[A-Za-z]/.test(beforeState)) {
        // City lives at the END of beforeState, after any comma.
        // beforeState shape on a one-line address: "4341 WILLOW BROOK AVE 111 LOS ANGELES"
        //   - split on comma if present, take the last segment
        //   - else assume city is the trailing uppercase word group
        if (beforeState.includes(',')) {
          const parts = beforeState.split(',').map((p) => p.trim()).filter(Boolean)
          if (parts.length >= 2) {
            street = parts.slice(0, -1).join(', ')
            city = parts[parts.length - 1]
          } else {
            city = parts[0]
          }
        } else {
          // No comma in beforeState — split into tokens, walk from right
          // until we hit a token containing digits (start of street).
          const toks = beforeState.split(/\s+/)
          const cityToks: string[] = []
          while (toks.length > 0) {
            const t = toks[toks.length - 1]
            if (/\d/.test(t)) break
            cityToks.unshift(toks.pop() as string)
          }
          city = cityToks.join(' ')
          street = toks.join(' ')
        }
      }

      // If we didn't find street on this line, look at the previous
      // few lines for one that starts with a digit (house number).
      if (!street) {
        for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 4); i--) {
          const candidate = lines[i].trim()
          if (!candidate) continue
          // Street typically starts with a digit (house number).
          if (/^\d/.test(candidate) && candidate.length >= 4) {
            // Defensive: don't grab a date or a DL number that starts
            // with digits but has no street keywords. Look for typical
            // street suffixes (AVE, ST, BLVD, etc) OR a long enough
            // alpha-numeric token sequence.
            const looksLikeStreet =
              /\b(AVE|AVENUE|ST|STREET|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|PL|PLACE|WAY|HWY|HIGHWAY|PKWY|PARKWAY|CIR|CIRCLE|TER|TERRACE|TRL|TRAIL|SQ|SQUARE)\b/i.test(
                candidate,
              ) || /[A-Z][A-Z]+/.test(candidate)
            if (looksLikeStreet) {
              street = candidate
              break
            }
          }
        }
      }

      // City fallback: if still empty, try the line immediately above
      // the one containing the state token, last word block.
      if (!city && lineIdx > 0) {
        const prev = lines[lineIdx - 1].trim()
        const cityMatch = prev.match(/([A-Z][A-Z .'\-]*[A-Z])\s*$/)
        if (cityMatch) city = cityMatch[1]
      }

      // Validate before returning: reject obviously bogus combos.
      if (!state || state.length !== 2) continue
      if (!/^\d{5}(-\d{4})?$/.test(zip)) continue
      // Require at least city OR street. State+zip alone aren't useful.
      if (!city && !street) continue

      return {
        street: street ? titleCaseString(street) : '',
        city: city ? titleCaseString(city.replace(/[,]+$/, '').trim()) : '',
        state: state.toUpperCase(),
        zip,
      }
    }
  }

  return null
}

/**
 * Old line-pair finder, kept as fallback for the common 2-line layout
 * (street on line N, "CITY, ST ZIP" on line N+1).
 */
function findAddressPair(ocr: OcrResult): {
  street: string
  city: string
  state: string
  zip: string
} | null {
  const cityLineRe = /^([A-Z][A-Z .'\-]*[A-Z])\s*,\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
  for (let i = 1; i < ocr.lines.length; i++) {
    const m = ocr.lines[i].text.match(cityLineRe)
    if (!m) continue
    const street = (ocr.lines[i - 1]?.text ?? '').trim()
    if (!street || street.length < 4) continue
    if (cityLineRe.test(street)) continue
    return {
      street: titleCaseString(street),
      city: titleCaseString(m[1]),
      state: m[2].toUpperCase(),
      zip: m[3],
    }
  }
  return null
}

export function runDlModule(ocr: OcrResult, opts: DlOptions): TpsModuleResult {
  const fields: TpsExtractedField[] = []
  const warnings: string[] = []

  const base = {
    extraction_source: 'ocr_keyword' as const,
    source_document_id: opts.document_id,
    language_layer: 'mixed' as const,
    user_corrected: false,
    bbox: null,
    confidence: 0.95,
    review_required: false,
    ocr_word_ids: [],
    passes: [],
    failures: [],
  }

  // ── DL number — letter + digits or digits-only; appears after "DL ".
  const dl = findOnAnyLine(ocr, /\bDL\s+([A-Z0-9]+)\b/)
  if (dl) {
    fields.push({ ...base, field: 'dl_number', raw_value: dl.value, normalized_value: dl.value, source_zone: 'dl_label', bbox: dl.bbox, confidence: dl.confidence })
  }

  // ── LN — last name (uppercase letters, may include apostrophe or dash).
  const ln = findOnAnyLine(ocr, /\bLN\s+([A-Z][A-Z'\-]+)\b/)
  if (ln) {
    fields.push({ ...base, field: 'family_name', raw_value: ln.value, normalized_value: titleCaseString(ln.value), source_zone: 'ln_label', bbox: ln.bbox, confidence: ln.confidence, review_required: true })
  }

  // ── FN — first name (allows space-separated middle names).
  const fn = findOnAnyLine(ocr, /\bFN\s+([A-Z][A-Z'\- ]+?)(?:\s{2,}|$)/)
  if (fn) {
    fields.push({ ...base, field: 'given_name', raw_value: fn.value.trim(), normalized_value: titleCaseString(fn.value.trim()), source_zone: 'fn_label', bbox: fn.bbox, confidence: fn.confidence, review_required: true })
  }

  // ── DOB — MM/DD/YYYY (US format).
  const dob = findOnAnyLine(ocr, /\bDOB\s+(\d{2}\/\d{2}\/\d{4})\b/)
  if (dob) {
    fields.push({ ...base, field: 'dob', raw_value: dob.value, normalized_value: usDateToIso(dob.value) ?? dob.value, source_zone: 'dob_label', bbox: dob.bbox, confidence: dob.confidence })
  }

  // ── SEX — single letter M / F / X. Pattern handles "SEX M" or "SEX: M".
  const sex = findOnAnyLine(ocr, /\bSEX\s*:?\s*([MFX])\b/)
  if (sex) {
    fields.push({ ...base, field: 'sex', raw_value: sex.value, normalized_value: sex.value, source_zone: 'sex_label', bbox: sex.bbox, confidence: sex.confidence })
  }

  // ── HGT — height in feet-inches. Google Vision tokenizes the
  // foot-inch literal with stray spaces (e.g. "HGT 6 ' - 06 \""), so
  // the regex must tolerate \s between every glyph. We capture the
  // raw matched range then collapse the whitespace for normalized_value.
  const hgt = findOnAnyLine(ocr, /\bHGT\s+(\d\s*['′]\s*[-\s]*\d{1,2}\s*["″])/)
  if (hgt) {
    const compact = hgt.value.replace(/\s+/g, '').replace(/['′]/g, "'").replace(/["″]/g, '"')
    fields.push({ ...base, field: 'height', raw_value: hgt.value, normalized_value: compact, source_zone: 'hgt_label', bbox: hgt.bbox, confidence: hgt.confidence })
  }

  // ── WGT — weight, e.g. "231 lb" or "78 kg".
  const wgt = findOnAnyLine(ocr, /\bWGT\s+(\d{2,3}\s*(?:lb|kg))/i)
  if (wgt) {
    fields.push({ ...base, field: 'weight', raw_value: wgt.value, normalized_value: wgt.value, source_zone: 'wgt_label', bbox: wgt.bbox, confidence: wgt.confidence })
  }

  // ── EYES — 3-letter color code (BRN, BLU, GRN, HZL, BLK, GRY).
  const eyes = findOnAnyLine(ocr, /\bEYES\s+([A-Z]{3})\b/)
  if (eyes) {
    fields.push({ ...base, field: 'eye_color', raw_value: eyes.value, normalized_value: eyes.value, source_zone: 'eyes_label', bbox: eyes.bbox, confidence: eyes.confidence })
  }

  // ── HAIR — 3-letter color code.
  const hair = findOnAnyLine(ocr, /\bHAIR\s+([A-Z]{3})\b/)
  if (hair) {
    fields.push({ ...base, field: 'hair_color', raw_value: hair.value, normalized_value: hair.value, source_zone: 'hair_label', bbox: hair.bbox, confidence: hair.confidence })
  }

  // ── Address — try flexible ZIP-anchored parser first, then fall back
  // to the strict line-pair parser for the common 2-line layout. Per
  // T3PS_ROBUST_OCR spec, the flexible parser handles rotated photos,
  // single-line addresses, and OCR line ordering that doesn't match
  // the printed card layout. All address parts are marked
  // requires_review=true because DL is NOT identity-authoritative on
  // a TPS application and the user must confirm the address before
  // we ship it to USCIS via I-131 Part 3.
  const addr = findAddressFlexible(ocr) ?? findAddressPair(ocr)
  if (addr) {
    if (addr.street) {
      fields.push({ ...base, field: 'us_address_street', raw_value: addr.street, normalized_value: addr.street, source_zone: 'dl_address_street', review_required: true })
    }
    if (addr.city) {
      fields.push({ ...base, field: 'us_address_city', raw_value: addr.city, normalized_value: addr.city, source_zone: 'dl_address_city', review_required: true })
    }
    if (addr.state) {
      fields.push({ ...base, field: 'us_address_state', raw_value: addr.state, normalized_value: addr.state, source_zone: 'dl_address_state', review_required: true })
    }
    if (addr.zip) {
      fields.push({ ...base, field: 'us_address_zip', raw_value: addr.zip, normalized_value: addr.zip, source_zone: 'dl_address_zip', review_required: true })
    }
    if (!addr.street || !addr.city) {
      warnings.push(
        'DL address parsed partially — street or city missing. Verify manually.',
      )
    }
  } else {
    warnings.push('DL address not detected — image quality, rotation, or layout. Enter manually.')
  }

  // Match requires at least 3 anchored fields — single hits are too
  // weak to confidently call this a DL (could be any text block with
  // an "LN" sequence). 3+ anchors is a reliable lower bound.
  const matched = fields.length >= 3

  if (!matched) {
    return {
      module: DL_MODULE,
      matched: false,
      match_reason: 'too_few_dl_anchors_matched',
      fields: [],
      warnings: ['Document does not look like a U.S. Driver\'s License. Tried DL / LN / FN / DOB / SEX anchors.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  return {
    module: DL_MODULE,
    matched: true,
    match_reason: 'dl_anchors_matched',
    fields,
    warnings,
    manual_review_required: false,
    manual_review_reasons: [],
  }
}
