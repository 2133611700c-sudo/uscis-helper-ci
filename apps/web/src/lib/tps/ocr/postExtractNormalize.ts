/**
 * Post-extraction normalization — applies @uscis-helper/knowledge rules
 * to extracted fields BEFORE they reach the wizard.
 *
 * This runs inside the OCR route, after module extraction and Brain,
 * but before the response is returned. It normalizes field values
 * so the wizard receives clean, USCIS-ready data.
 *
 * Lightweight by design — only normalizes what needs normalizing.
 * Raw values are preserved for audit trail.
 */

import { normalizeOblastToNominative, normalizePlace, transliterateKMU55 } from '@uscis-helper/knowledge'
import type { TpsExtractedField } from '@/lib/tps/types'

type NormalizationStatus = 'normalized' | 'rejected' | 'passed'

export interface KnowledgeFieldDiagnostic {
  field: string
  status: NormalizationStatus
  reason: string
  input_raw: string
  input_normalized: string | null
  output_normalized: string | null
  manual_required: boolean
}

const BROKEN_SETTLEMENT_PREFIX_RE =
  /^(?:слет|cлет|slet|смт|смт\.|cmt|smt|cмт|с-ще|селище\s+міського\s+типу)\s*[.\-:]*\s*/iu

const CITY_PREFIX_RE =
  /^(?:смт\.?|с-ще\.?|м\.|с\.|сел\.|хут\.|п\.?г\.?т\.?)\s*/iu

// A3 FIX: "обл" (3 chars) added — Brain outputs "ОБЛ." not full "область".
// Also added "obl" for Latin variant ("VINNYTSKA OBL.").
const CITY_NOISE_RE =
  /(?:date|birth|place|місц|мест|народжен|рожден|област|обл[.:]?|oblast|obl[.:]?|province|settlement|urban-type|селище)/iu

const PROVINCE_LATIN_MAP: Array<{ re: RegExp; value: string }> = [
  { re: /\bvin+yt+s?k\w*\s+obl(?:ast)?\.?$/iu, value: 'Vinnytsia Oblast' },
  { re: /\bvolyn\w*\s+obl(?:ast)?\.?$/iu, value: 'Volyn Oblast' },
  { re: /\bdnipropetrov\w*\s+obl(?:ast)?\.?$/iu, value: 'Dnipropetrovsk Oblast' },
  { re: /\bdonetsk\w*\s+obl(?:ast)?\.?$/iu, value: 'Donetsk Oblast' },
  { re: /\bzhytomyr\w*\s+obl(?:ast)?\.?$/iu, value: 'Zhytomyr Oblast' },
  { re: /\bzakarpatt\w*\s+obl(?:ast)?\.?$/iu, value: 'Zakarpattia Oblast' },
  { re: /\bzaporizh\w*\s+obl(?:ast)?\.?$/iu, value: 'Zaporizhzhia Oblast' },
  { re: /\bivano[-\s]?frankiv\w*\s+obl(?:ast)?\.?$/iu, value: 'Ivano-Frankivsk Oblast' },
  { re: /\bkyiv\w*\s+obl(?:ast)?\.?$/iu, value: 'Kyiv Oblast' },
  { re: /\bkirovohrad\w*\s+obl(?:ast)?\.?$/iu, value: 'Kirovohrad Oblast' },
  { re: /\bluhansk\w*\s+obl(?:ast)?\.?$/iu, value: 'Luhansk Oblast' },
  { re: /\blviv\w*\s+obl(?:ast)?\.?$/iu, value: 'Lviv Oblast' },
  { re: /\bmykolaiv\w*\s+obl(?:ast)?\.?$/iu, value: 'Mykolaiv Oblast' },
  { re: /\bodesa\w*\s+obl(?:ast)?\.?$/iu, value: 'Odesa Oblast' },
  { re: /\bpoltava\w*\s+obl(?:ast)?\.?$/iu, value: 'Poltava Oblast' },
  { re: /\brivne\w*\s+obl(?:ast)?\.?$/iu, value: 'Rivne Oblast' },
  { re: /\bsumy\w*\s+obl(?:ast)?\.?$/iu, value: 'Sumy Oblast' },
  { re: /\bternopil\w*\s+obl(?:ast)?\.?$/iu, value: 'Ternopil Oblast' },
  { re: /\bkharkiv\w*\s+obl(?:ast)?\.?$/iu, value: 'Kharkiv Oblast' },
  { re: /\bkherson\w*\s+obl(?:ast)?\.?$/iu, value: 'Kherson Oblast' },
  { re: /\bkhmelnytsk\w*\s+obl(?:ast)?\.?$/iu, value: 'Khmelnytskyi Oblast' },
  { re: /\bcherkasy\w*\s+obl(?:ast)?\.?$/iu, value: 'Cherkasy Oblast' },
  { re: /\bchernivtsi\w*\s+obl(?:ast)?\.?$/iu, value: 'Chernivtsi Oblast' },
  { re: /\bchernihiv\w*\s+obl(?:ast)?\.?$/iu, value: 'Chernihiv Oblast' },
]

function cleanCityCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[.\-:,\s]+/u, '')
    .replace(BROKEN_SETTLEMENT_PREFIX_RE, '')
    .replace(/\b(?:urban-type\s+settlement|settlement|селище(?:\s+міського\s+типу)?)\b/giu, ' ')
    .replace(CITY_PREFIX_RE, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function validateCity(value: string): { ok: boolean; reason: string } {
  if (!value) return { ok: false, reason: 'empty' }
  if (value.length < 2) return { ok: false, reason: 'too_short' }
  if (value.length > 64) return { ok: false, reason: 'too_long' }
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/u.test(value)) return { ok: false, reason: 'no_letters' }
  if (/\d{4}/.test(value)) return { ok: false, reason: 'contains_year_fragment' }
  if (CITY_NOISE_RE.test(value)) return { ok: false, reason: 'contains_label_noise' }
  // A3 FIX: JavaScript \b does NOT work with Cyrillic — Cyrillic letters
  // are \W (non-word), so \b never fires around them. Use explicit
  // boundary: start/end of string, whitespace, or punctuation.
  if (/(?:^|[\s.,;:!?])(?:обл|obl|oblast|province)(?:[\s.,;:!?]|$)/iu.test(value)) return { ok: false, reason: 'looks_like_province' }

  // ── BOOKLET GARBAGE-REJECTION GUARD ──────────────────────────────────────
  // Brain sometimes hallucinates gibberish like "BiRHEROI odwaemi" with
  // confidence 0.9. These checks catch OCR/AI garbage that LOOKS like text
  // but is not a valid city name.

  // 1. Mixed-case gibberish within a single word.
  // Valid: "Trostianets" (Title), "KYIV" (ALL UPPER), "kyiv" (all lower)
  // Invalid: "BiRHEROI" (B-i-R-H-E-R-O-I = random case mixing)
  const latinWords = value.match(/[A-Za-z]{3,}/g) || []
  for (const w of latinWords) {
    const isAllUpper = w === w.toUpperCase()
    const isAllLower = w === w.toLowerCase()
    const isTitleCase = /^[A-Z][a-z]+$/.test(w)
    if (!isAllUpper && !isAllLower && !isTitleCase) {
      return { ok: false, reason: 'garbage_mixed_case' }
    }
  }

  // 2. Gibberish consonant clusters — 5+ consonants in a row is not a
  // plausible Ukrainian city name (even transliterated).
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(value)) {
    return { ok: false, reason: 'garbage_consonant_cluster' }
  }

  // 3. Too many words for a city name. Real Ukrainian cities: 1-3 words
  // ("Bila Tserkva", "Ivano-Frankivsk"). 4+ words = likely garbage or
  // label text that slipped through.
  const wordCount = value.trim().split(/\s+/).length
  if (wordCount > 3) {
    return { ok: false, reason: 'garbage_too_many_words' }
  }

  return { ok: true, reason: 'ok' }
}

function normalizeProvince(raw: string): { ok: boolean; value: string | null; reason: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, value: null, reason: 'empty' }

  const ua = normalizeOblastToNominative(trimmed)
  if (ua) return { ok: true, value: ua.transliterated, reason: 'oblast_genitive_to_nominative' }

  const latin = transliterateKMU55(trimmed)
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  for (const entry of PROVINCE_LATIN_MAP) {
    if (entry.re.test(latin)) return { ok: true, value: entry.value, reason: 'latin_oblast_alias_map' }
  }

  // Final fallback through canonical normalizer for place strings.
  const normalized = normalizePlace(trimmed, 'province_of_birth', 'booklet', {
    mode: 'uscis_normalized',
    controlling_spellings: [],
    is_historical_document: true,
  })
  if (normalized.normalized_value && /\bOblast$/iu.test(normalized.normalized_value)) {
    return { ok: true, value: normalized.normalized_value, reason: normalized.rule_applied }
  }

  return { ok: false, value: null, reason: 'unrecognized_oblast' }
}

/**
 * Normalize extracted fields in-place using canonical knowledge rules.
 * Returns the same array with updated normalized_value where applicable.
 * Also returns metadata about what was normalized and any conflicts found.
 */
export function postExtractNormalize(fields: TpsExtractedField[]): {
  fields: TpsExtractedField[]
  normalizations_applied: string[]
  conflicts: Array<{ field: string; reason: string }>
  low_confidence: Array<{ field: string; confidence: number }>
  rejected_fields: string[]
  diagnostics: KnowledgeFieldDiagnostic[]
} {
  const normalizations: string[] = []
  const conflicts: Array<{ field: string; reason: string }> = []
  const lowConf: Array<{ field: string; confidence: number }> = []
  const rejected = new Set<string>()
  const diagnostics: KnowledgeFieldDiagnostic[] = []

  for (const f of fields) {
    // Track low-confidence fields for mail-ready gate
    if (f.confidence !== null && f.confidence < 0.7) {
      lowConf.push({ field: f.field, confidence: f.confidence })
    }

    // ── CANONICAL CUTOVER (GAP-2) ────────────────────────────────────────
    // When a field came from the Document Core (extraction_source ===
    // 'canonical_core'), its semantic value was ALREADY produced by the
    // Core's knowledgeNormalize + arbitration: oblast genitive→nominative,
    // KMU-55 transliteration, place normalization, name/patronymic handling,
    // and country validation all ran inside the Core. Re-running them here
    // is a LEGACY_DUPLICATE — it can mangle an already-correct canonical
    // value (e.g. re-title-casing, re-transliterating a Latin MRZ name) and
    // re-derives a verdict the arbiter already made.
    //
    // So for canonical fields we SKIP all semantic re-normalization. Only
    // PRODUCT_FORMATTING_ONLY remains (date US→ISO), because the I-821 PDF
    // writer needs ISO dates and that transform does not change the
    // semantic value (same instant, different surface form). Everything
    // else passes through untouched with a `passed` diagnostic.
    const isCanonical = f.extraction_source === 'canonical_core'

    // P2 FIX: normalize date fields from US format (MM/DD/YYYY) to ISO
    // (YYYY-MM-DD). Brain often outputs US format. Without this, dates
    // pass through as "01/25/1990" instead of "1990-01-25".
    // PRODUCT_FORMATTING_ONLY — allowed even for canonical fields.
    if ((f.field === 'dob' || f.field === 'last_entry_date' || f.field === 'ead_expiration_date') && f.normalized_value) {
      const v = f.normalized_value.trim()
      const usMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (usMatch) {
        const iso = `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
        normalizations.push(`${f.field}: "${v}" → "${iso}" (US→ISO)`)
        f.normalized_value = iso
        f.passes = [...f.passes, 'knowledge_date_us_to_iso']
      }
    }

    // Canonical fields: stop here. Emit a `passed` diagnostic so the wizard
    // (which reads knowledge_diagnostics for the booklet drop-rule) still
    // sees the field, and skip every semantic re-normalization branch below.
    if (isCanonical) {
      diagnostics.push({
        field: f.field,
        status: 'passed',
        reason: 'canonical_core_no_renormalize',
        input_raw: f.raw_value,
        input_normalized: f.normalized_value,
        output_normalized: f.normalized_value,
        manual_required: false,
      })
      continue
    }

    // Oblast genitive → nominative (DMS-verified English)
    if (f.field === 'province_of_birth' && (f.normalized_value || f.raw_value)) {
      // ROOT CAUSE FIX: Brain preserves original Cyrillic in raw_value
      // ("Вінницької област") but normalized_value is Brain's unstable
      // Latin transliteration ("VINNYTSKA OBL." / "Vinnytskoi oblast").
      // normalizeOblastToNominative handles Cyrillic natively → try
      // raw_value FIRST. Fall back to normalized_value for Latin-form
      // matching via PROVINCE_LATIN_MAP.
      let province = normalizeProvince(f.raw_value || '')
      if (!province.ok && f.normalized_value) {
        province = normalizeProvince(f.normalized_value)
      }
      const input = f.normalized_value || f.raw_value || ''
      if (province.ok && province.value) {
        f.normalized_value = province.value
        f.passes = [...f.passes, `knowledge_${province.reason}`]
        normalizations.push(`province_of_birth: "${f.raw_value}" → "${province.value}"`)
        diagnostics.push({
          field: f.field,
          status: 'normalized',
          reason: province.reason,
          input_raw: f.raw_value,
          input_normalized: input,
          output_normalized: province.value,
          manual_required: false,
        })
      } else {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, `knowledge_province_rejected:${province.reason}`]
        diagnostics.push({
          field: f.field,
          status: 'rejected',
          reason: province.reason,
          input_raw: f.raw_value,
          input_normalized: input,
          output_normalized: null,
          manual_required: true,
        })
      }
      continue
    }

    // City of birth: expand Ukrainian settlement type abbreviations
    // "смт. Устинівка" → "Устинівка" (strip prefix, pdfPrefiller transliterates)
    // "м. Київ" → "Київ"
    // "с. Іванівка" → "Іванівка"
    if (f.field === 'city_of_birth' && (f.normalized_value || f.raw_value)) {
      const rawInput = `${f.raw_value || ''} ${f.normalized_value || ''}`.trim()
      if (/\b(?:urban-type\s+settlement|settlement)\b/iu.test(rawInput)) {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, 'knowledge_city_rejected:contains_settlement_descriptor']
        diagnostics.push({
          field: f.field,
          status: 'rejected',
          reason: 'contains_settlement_descriptor',
          input_raw: f.raw_value,
          input_normalized: f.normalized_value,
          output_normalized: null,
          manual_required: true,
        })
        continue
      }

      // ROOT CAUSE FIX: Brain's raw_value preserves Cyrillic ("слет. Тростянець")
      // which cleanCityCandidate handles (strips settlement prefix).
      // Try raw_value first → clean → validate → transliterate via canonical path.
      // Fall back to normalized_value (Brain's Latin) if raw fails.
      const rawCleaned = cleanCityCandidate(f.raw_value || '')
      const rawValid = validateCity(rawCleaned)
      const normCleaned = cleanCityCandidate(f.normalized_value || '')
      const normValid = validateCity(normCleaned)
      const useCleaned = rawValid.ok ? rawCleaned : normValid.ok ? normCleaned : ''
      const useValid = rawValid.ok ? rawValid : normValid
      const input = f.normalized_value || f.raw_value || ''
      if (!useValid.ok) {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, `knowledge_city_rejected:${useValid.reason}`]
        diagnostics.push({
          field: f.field,
          status: 'rejected',
          reason: useValid.reason,
          input_raw: f.raw_value,
          input_normalized: input,
          output_normalized: null,
          manual_required: true,
        })
      } else {
        const normalized = normalizePlace(useCleaned, 'city_of_birth', 'booklet', {
          mode: 'uscis_normalized',
          controlling_spellings: [],
          is_historical_document: true,
        })
        const output = normalized.normalized_value || useCleaned
        f.normalized_value = output
        f.passes = [...f.passes, `knowledge_city:${normalized.rule_applied}`]
        normalizations.push(`city_of_birth: "${input}" → "${output}"`)
        diagnostics.push({
          field: f.field,
          status: 'normalized',
          reason: normalized.rule_applied,
          input_raw: f.raw_value,
          input_normalized: input,
          output_normalized: output,
          manual_required: false,
        })
      }
      continue
    }

    // ── COUNTRY FIELDS — reject hallucinated names as countries ───────────
    // Brain sometimes puts surname as country_of_citizenship (e.g., "IVANENKO").
    // Country fields must be real country names, not person names.
    if ((f.field === 'country_of_citizenship' || f.field === 'country_of_birth' ||
         f.field === 'country_of_nationality' || f.field === 'passport_country_of_issuance') &&
        (f.normalized_value || f.raw_value)) {
      const val = ((f.normalized_value || f.raw_value) ?? '').trim()
      const KNOWN_COUNTRIES = new Set([
        'ukraine', 'united states', 'usa', 'us', 'russia', 'belarus', 'poland',
        'moldova', 'romania', 'hungary', 'slovakia', 'czech republic', 'czechia',
        'germany', 'france', 'italy', 'spain', 'united kingdom', 'uk', 'canada',
        'mexico', 'brazil', 'argentina', 'china', 'japan', 'india', 'turkey',
        'israel', 'georgia', 'armenia', 'azerbaijan', 'kazakhstan', 'uzbekistan',
      ])
      if (!KNOWN_COUNTRIES.has(val.toLowerCase())) {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, 'knowledge_country_not_recognized']
        diagnostics.push({ field: f.field, status: 'rejected', reason: 'country_not_recognized',
          input_raw: f.raw_value, input_normalized: val, output_normalized: null, manual_required: true })
        continue
      }
    }

    // ── FAMILY_NAME — booklet-only users: Cyrillic → Latin KMU-55 ───────
    // For users with загранпаспорт, MRZ already provides Latin family_name
    // and the arbiter picks MRZ over booklet (priority 1 vs 5). For booklet-
    // only users (no MRZ source), the surname stays Cyrillic without this
    // rule. I-821 form requires Latin. KMU-55 is the official Ukrainian
    // government transliteration standard for passports — same rules USCIS
    // expects on the form.
    if (f.field === 'family_name' && (f.normalized_value || f.raw_value)) {
      const raw = (f.raw_value || '').trim()
      const norm = (f.normalized_value || '').trim()
      const input = norm || raw

      // Skip if already Latin (MRZ or EAD/I-94 keyword extraction). Don't
      // re-transliterate already-Latin values like "Ivanenko" — it would mangle them.
      const hasCyrillic = /[А-Яа-яІіЇїЄєҐґ]/.test(input)
      if (!hasCyrillic) {
        // Garbage guard: mixed-case Latin (e.g. "BiRHEROI" from broken OCR).
        // Title case "Ivanenko" and ALL CAPS "IVANENKO" are both ok.
        const latinWords = input.match(/[A-Za-z]{3,}/g) || []
        let isGarbage = false
        for (const w of latinWords) {
          const allUp = w === w.toUpperCase()
          const allLo = w === w.toLowerCase()
          const title = /^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)*$/.test(w)
          if (!allUp && !allLo && !title) { isGarbage = true; break }
        }
        if (isGarbage || input.length < 2 || input.length > 50) {
          rejected.add(f.field)
          f.normalized_value = null
          f.review_required = true
          f.failures = [...f.failures, 'knowledge_family_name_garbage']
          diagnostics.push({ field: f.field, status: 'rejected', reason: 'family_name_garbage',
            input_raw: raw, input_normalized: input, output_normalized: null, manual_required: true })
          continue
        }
        // Latin passthrough — but title-case if all caps (MRZ delivers ALL CAPS).
        const output = input === input.toUpperCase()
          ? input.toLowerCase().replace(/(^|[-\s'])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
          : input
        if (output !== input) {
          f.normalized_value = output
          f.passes = [...f.passes, 'knowledge_family_name:latin_titlecase']
          normalizations.push(`family_name: "${input}" → "${output}"`)
          diagnostics.push({ field: f.field, status: 'normalized', reason: 'latin_titlecase',
            input_raw: raw, input_normalized: input, output_normalized: output, manual_required: false })
        } else {
          diagnostics.push({ field: f.field, status: 'passed', reason: 'latin_passthrough',
            input_raw: raw, input_normalized: input, output_normalized: input, manual_required: false })
        }
        continue
      }

      // Cyrillic path (booklet-only users): KMU-55 transliteration.
      // Garbage guard: surname must contain only letters, apostrophes, hyphens, spaces.
      if (input.length < 2 || input.length > 50 || /\d/.test(input)) {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, 'knowledge_family_name_invalid_shape']
        diagnostics.push({ field: f.field, status: 'rejected', reason: 'family_name_invalid_shape',
          input_raw: raw, input_normalized: input, output_normalized: null, manual_required: true })
        continue
      }
      const output = transliterateKMU55(input)
      f.normalized_value = output
      f.passes = [...f.passes, 'knowledge_family_name:kmu55']
      normalizations.push(`family_name: "${input}" → "${output}"`)
      diagnostics.push({ field: f.field, status: 'normalized', reason: 'kmu55_transliteration',
        input_raw: raw, input_normalized: input, output_normalized: output, manual_required: false })
      continue
    }

    // ── PATRONYMIC («По батькові») — booklet Cyrillic → Latin ─────────────
    // Accept both the correct source key `patronymic` and the legacy `middle_name`.
    if ((f.field === 'patronymic' || f.field === 'middle_name') && (f.normalized_value || f.raw_value)) {
      const raw = (f.raw_value || '').trim()
      const norm = (f.normalized_value || '').trim()
      const input = norm || raw

      // Guard 1: mixed-case gibberish (same as city)
      const latinWords = input.match(/[A-Za-z]{3,}/g) || []
      let isGarbage = false
      for (const w of latinWords) {
        const allUp = w === w.toUpperCase()
        const allLo = w === w.toLowerCase()
        const title = /^[A-Z][a-z]+$/.test(w)
        if (!allUp && !allLo && !title) { isGarbage = true; break }
      }

      // Guard 2: Ukrainian patronymic must end in known suffixes.
      // Cyrillic: -ович, -овна, -івна, -ївна, -іч
      // Latin: -ovych, -ovna, -ivna, -yivna, -ich
      // If it's Latin text without a valid patronymic ending → garbage.
      const hasCyrillic = /[А-Яа-яІіЇїЄєҐґ]/.test(input)
      if (!hasCyrillic && !isGarbage) {
        const lc = input.toLowerCase()
        const validLatinEnding = /(?:ovych|ovich|ovna|ivna|yivna|ich|ych|vna)$/i.test(lc)
        if (!validLatinEnding) {
          isGarbage = true // "Cepriticbur" → no valid ending → reject
        }
      }
      // Cyrillic patronymic ending check
      if (hasCyrillic && !isGarbage) {
        const validCyrEnding = /(?:ович|овна|івна|ївна|іч|ич)$/i.test(input)
        if (!validCyrEnding) {
          isGarbage = true
        }
      }

      if (isGarbage || input.length < 2 || input.length > 50) {
        rejected.add(f.field)
        f.normalized_value = null
        f.review_required = true
        f.failures = [...f.failures, 'knowledge_patronymic_garbage']
        diagnostics.push({ field: f.field, status: 'rejected', reason: 'patronymic_garbage',
          input_raw: raw, input_normalized: input, output_normalized: null, manual_required: true })
      } else {
        const output = hasCyrillic ? transliterateKMU55(input) : input
        f.normalized_value = output
        f.passes = [...f.passes, `knowledge_patronymic:${hasCyrillic ? 'kmu55' : 'latin_passthrough'}`]
        normalizations.push(`middle_name: "${input}" → "${output}"`)
        diagnostics.push({ field: f.field, status: 'normalized',
          reason: hasCyrillic ? 'kmu55_transliteration' : 'latin_passthrough',
          input_raw: raw, input_normalized: input, output_normalized: output, manual_required: false })
      }
      continue
    }

    // Track duplicate field values across documents for conflict detection
    // (e.g., name from passport MRZ vs name from DL)
    diagnostics.push({
      field: f.field,
      status: 'passed',
      reason: 'no_knowledge_rule_for_field',
      input_raw: f.raw_value,
      input_normalized: f.normalized_value,
      output_normalized: f.normalized_value,
      manual_required: false,
    })
  }

  return {
    fields,
    normalizations_applied: normalizations,
    conflicts,
    low_confidence: lowConf,
    rejected_fields: Array.from(rejected),
    diagnostics,
  }
}
