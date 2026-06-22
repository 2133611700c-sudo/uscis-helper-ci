/**
 * docintel/transliterationPolicy — THE single place that turns a Cyrillic
 * vision read into a canonical value. Centralizes the rule proven empirically
 * (2026-05-27) and mandated by v5 §13: vision reads Cyrillic, KMU-55 produces
 * Latin — the LLM NEVER transliterates names (free-form LLM output is unstable
 * and non-reproducible). Every product flow gets identical canonical values from here.
 */

import { transliterateKMU55, transliterateRussian, detectNameScript, SEX_MAP } from '@uscis-helper/knowledge'
import { normalizeProvince, normalizeCity } from '@/lib/tps/dictionaryBridge'
import type { FieldKind, VisionFieldRead } from './types'

/**
 * Strip a leading Ukrainian settlement-type prefix from a place name, robust to
 * dotted/spaced variants (смт, с.м.т., смт., м., с., село, місто, селище
 * міського типу). The bare locality remains; the original (with type) is kept
 * by the caller in raw_cyrillic so translation can re-add "urban-type settlement".
 */
export function stripSettlementPrefix(cy: string): string {
  return cy
    .replace(
      /^\s*(?:с\.?\s*м\.?\s*т\.?|смт\.?|селище(?:\s+міського\s+типу)?|місто|село|м\.|с\.)\s+/iu,
      '',
    )
    .trim()
}

/**
 * Strip an ICAO/passport COUNTRY CODE token from a place-of-birth string.
 *
 * UA international passports print place of birth with the issuing-country code
 * appended ("ВІННИЦЬКА ОБЛ./UKR"). Gemini reads (and apostille/typed variants)
 * attach that token with ANY separator — "/", "|", ",", or whitespace — and it
 * can appear as a trailing SUFFIX or a leading PREFIX. The country code must
 * never leak into the released city/oblast value.
 *
 * Safety: the code is removed ONLY when it is a STANDALONE token sitting next to
 * a separator (or at the very start/end). An embedded substring is preserved —
 * e.g. the real settlement "Українка"/"Ukrainka" is NOT corrupted, because "ukr"
 * there is not a whole token delimited by a separator.
 */
const COUNTRY_CODE = '(?:ukraine|україна|ukr|укр|ua|уа)\\.?'
export function stripCountryCode(cy: string): string {
  return cy
    // trailing: "<place><sep>UKR" — sep is /,| or whitespace; token at end.
    .replace(new RegExp(`[\\s/|,]+${COUNTRY_CODE}\\s*$`, 'iu'), '')
    // leading:  "UKR<sep><place>" — token at start followed by a separator.
    .replace(new RegExp(`^\\s*${COUNTRY_CODE}[\\s/|,]+`, 'iu'), '')
    .trim()
}

/**
 * Owner-locked source-script rule (2026-06-10): VISIBLE source script controls
 * transliteration. A name line is AMBIGUOUS when its script is not visually
 * confirmed — no distinctive Ukrainian letter (і/ї/є/ґ) AND no distinctive
 * Russian letter (ы/э/ё/ъ). Old Soviet/bilingual docs legitimately mix UA and RU
 * lines, so we never guess the document's language: an ambiguous name must go to
 * review (review_required=true, reason_code=source_script_ambiguous) and must NOT
 * be finalized by C3 until the source script is confirmed or the user/admin
 * confirms. D2 may still surface a best-effort KMU-55 candidate for the screen.
 *
 * GATE DECOUPLED (C3, 2026-06-20, audit #195 / Agent B). This REVIEW gate used to
 * be coupled to RU_TRANSLIT_ENABLED (default OFF), which conflated two independent
 * things and left the strictly-safe half inert in production:
 *   (1) SAFE — flag an ambiguous name for REVIEW so it is never SILENTLY romanized
 *       with a guessed system. This changes NO output value (the on-screen
 *       candidate stays the exact same KMU-55 string it is today); it only adds a
 *       review reason + blocks C3 finalization (applyOcrFieldSafety nulls final).
 *       It CANNOT reintroduce the line-~110 "Russification amplification"
 *       regression, because it never calls the Russian table — that regression was
 *       about CHANGING romanization OUTPUT, not about raising a review flag.
 *   (2) RISKY — actually routing a clearly-RU read through transliterateRussian
 *       (see toCanonicalValue below), which previously amplified Russified
 *       mis-reads. That output change stays gated behind RU_TRANSLIT_ENABLED and is
 *       intentionally NOT enabled here (deferred — needs real-OCR validation).
 *
 * So this review gate now has its OWN flag, SOURCE_SCRIPT_REVIEW_ENABLED, default
 * ON: undefined/'' ⇒ ON; only an explicit '0' disables it (an escape hatch if the
 * review proves too noisy in production). RU_TRANSLIT_ENABLED='1' also still arms
 * the gate, so any caller/test that set only that flag keeps the old behavior.
 * Strictly review/finalization gating — no romanization OUTPUT changes here.
 */
export function isNameSourceScriptAmbiguous(
  cy: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const reviewArmed = env.SOURCE_SCRIPT_REVIEW_ENABLED !== '0' || env.RU_TRANSLIT_ENABLED === '1'
  if (!reviewArmed) return false
  const s = (cy ?? '').trim()
  if (!s) return false
  return detectNameScript(s) === 'unknown'
}

/**
 * Romanize a Cyrillic string to Latin, choosing the table by SOURCE script.
 * Unambiguously-Russian content (distinctive ы/э/ё/ъ, no Ukrainian і/ї/є/ґ) MUST
 * use the Russian table: KMU-55 cannot map those letters (г→h is wrong for a
 * Russian word, and ё/э/ы/ъ would otherwise leak as raw Cyrillic). This routing is
 * UNCONDITIONAL (not flag-gated) because it is not a guess — the source script is
 * visually confirmed by letters that exist only in Russian, and the alternative is
 * a guaranteed Cyrillic leak into the released value (e.g. «город Подъездный» must
 * be "gorod Podyezdnyy", never "horod Podezdnыi"). Ukrainian / ambiguous content
 * stays on KMU-55, preserving the owner's anti-Russification default. The `name`
 * kind keeps its own flag-gated routing above; this helper is for place/agency/text.
 */
function romanizeBySourceScript(cy: string): string {
  return detectNameScript(cy) === 'ru' ? transliterateRussian(cy) : transliterateKMU55(cy)
}

/**
 * Convert one vision read to its canonical value by field kind.
 * Returns null when there is nothing trustworthy to emit (no guessing).
 */
export function toCanonicalValue(read: VisionFieldRead, kind: FieldKind): string | null {
  const cy = (read.cyrillic ?? '').trim()

  switch (kind) {
    case 'date':
      // Dates: trust only a well-formed ISO from the model; never guess.
      return read.iso_date && /^\d{4}-\d{2}-\d{2}$/.test(read.iso_date) ? read.iso_date : null

    case 'name': {
      // Names: KMU-55 (Ukrainian). Never the LLM's own Latin.
      if (!cy) return null
      // CONTROLLING LATIN: if the value is ALREADY printed in Latin (international
      // passport / ID card romanization or MRZ, e.g. "TARAS"), it is the official
      // controlling spelling — keep it VERBATIM, never re-transliterate the Cyrillic
      // into a different romanization (ТАРАС→Taras would disagree with the passport).
      if (/[A-Za-z]/.test(cy) && !/[Ѐ-ӿ]/.test(cy)) {
        return cy.replace(/\s+/g, ' ').trim() || null
      }
      // RU routing is flag-gated again (reverted 2026-06-12 after the always-on
      // version amplified Russified reads): the owner's real problem is Ukrainian
      // being mis-read as Russian, and with the strong anti-Russification prompt
      // restored a correct read stays Ukrainian. Behind RU_TRANSLIT_ENABLED a
      // clearly-Russian read (ы/э/ё/ъ, no і/ї/є/ґ) uses the Russian table (KMU-55
      // can't map those letters); default OFF ⇒ everything goes KMU-55.
      if (process.env.RU_TRANSLIT_ENABLED === '1' && detectNameScript(cy) === 'ru') {
        return transliterateRussian(cy) || null
      }
      return transliterateKMU55(cy) || null
    }

    case 'place_city': {
      // City: strip the settlement-type prefix so the canonical value is the
      // BARE city (USCIS form wants "Trostianets", not "urban-type settlement
      // Trostianets"). Vision may return дотted/spaced variants (смт, с.м.т.,
      // м., с.). We strip on the Cyrillic first (robust to dots), then run
      // normalizeCity (blocklist/geo-corrections), then KMU-55. The settlement
      // type stays in raw_cyrillic for the translation layer to re-add.
      if (!cy) return null
      // Passport "place of birth" is often an OBLAST with a country code
      // ("ВІННИЦЬКА ОБЛ./UKR" on the international passport). Strip the UKR/UA
      // country code, and if it's an oblast (обл./область) route to the oblast
      // normalizer → "Vinnytsia Oblast", not a literal "Vinnytska Obl./UKR".
      // (NB: JS \b does not work on Cyrillic, so we match обл/область directly.)
      // GENERALIZED (Agent 1, real intl-passport): the country code is a STANDALONE
      // token attached by ANY separator — "/", "|", ",", or whitespace — and may
      // appear as a trailing suffix OR a leading prefix. The old regex handled only
      // "/UKR"|"|UKR" at the end, so " UKR" / ",UKR" / "UKRAINE/<city>" leaked the
      // code into the released place value. We strip a country token only when it is
      // a whole token next to a real separator, so an embedded substring (e.g. the
      // settlement "Українка"/"Ukrainka") is preserved.
      const noCountry = stripCountryCode(cy)
      if (/обл\.?|област[ьі:]/iu.test(noCountry)) {
        const expanded = noCountry.replace(/\s*обл\.?\s*$/iu, ' область').trim()
        return normalizeProvince(expanded).value || normalizeProvince(noCountry).value || romanizeBySourceScript(noCountry) || null
      }
      const bare = stripSettlementPrefix(noCountry)
      const nc = normalizeCity(bare)
      if (nc.value === null) return null // blocklisted
      return /[a-zA-Z]/.test(nc.value) ? nc.value : romanizeBySourceScript(nc.value) || null
    }

    case 'place_oblast':
      // Oblast → nominative + "Oblast" (e.g. Вінницька область → Vinnytsia Oblast).
      return cy ? normalizeProvince(cy).value || romanizeBySourceScript(cy) || null : null

    case 'doc_number':
      // Document/series/act numbers: preserve exactly. If the model returned a
      // Latin/numeric value in cyrillic field, keep it verbatim.
      return cy || null

    case 'agency':
      // Agency name: transliterate as a baseline; downstream glossary may refine.
      return cy ? romanizeBySourceScript(cy) || cy : null

    case 'sex': {
      // Sex marker: map Ч/Ж/чол/жін/M/F → Male/Female. Passports print it BILINGUAL
      // ("Ч/M", "Ж/F") — try the whole string, then each slash-separated part.
      // Unknown → keep raw so the knowledge brain flags it for review (never "Ch").
      if (!cy) return null
      const direct = SEX_MAP[cy] ?? SEX_MAP[cy.toLowerCase()]
      if (direct) return direct
      for (const part of cy.split(/[\/\\|,;]/).map((s) => s.trim())) {
        const m = SEX_MAP[part] ?? SEX_MAP[part.toLowerCase()]
        if (m) return m
      }
      return cy
    }

    case 'text':
    default:
      return cy ? romanizeBySourceScript(cy) || cy : null
  }
}
