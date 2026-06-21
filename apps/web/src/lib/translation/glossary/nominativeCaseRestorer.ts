/**
 * Nominative Case Restorer — Messenginfo v5.0
 * Restores Ukrainian names from oblique/genitive case to nominative
 * before transliteration. Critical for passport booklets where
 * names appear in dative form: "Петренку Івану" → "Petrenko Ivan"
 *
 * TRANSLITERATION: delegates to @uscis-helper/knowledge (canonical KMU-55)
 * CASE RESTORATION: this module (unique logic, not duplicated)
 */
import { transliterateKMU55, normalizeOblastToNominative } from '@uscis-helper/knowledge'

// Common oblique → nominative suffix mappings (Ukrainian)
// Sorted longest first to avoid partial matches
const SUFFIX_MAP: Array<[string, string]> = [
  // Feminine
  ['овій', 'ова'], ['євій', 'єва'],
  ['овою', 'ова'], ['євою', 'єва'],
  ['івні', 'івна'], ['євні', 'євна'],
  ['овні', 'овна'],
  // Masculine dative
  ['ченку', 'ченко'], ['енку', 'енко'], ['анку', 'анко'],
  ['ькові', 'ьків'], ['ькові', 'ько'],
  ['ькові', 'ьком'],
  // Common dative endings
  ['ові', ''],     // Іванов → Іванові → strip
  ['єві', ''],
  ['еві', ''],
  // Genitive
  ['енка', 'енко'], ['ченка', 'ченко'],
  ['ія', 'ій'],
  ['ого', 'ий'], ['ього', 'ій'],
  ['ої', 'а'],
  // Instrumental
  ['ою', 'а'], ['ею', 'я'],
]

// Known -ко surname rule: dative = -ку, nominative = -ко
const KO_DATIVE = /^(.+?)ку$/i

export function restoreNominative(name: string): string {
  if (!name || !name.trim()) return name
  const words = name.trim().split(/\s+/)
  return words.map(restoreWord).join(' ')
}

function restoreWord(word: string): string {
  const koMatch = word.match(KO_DATIVE)
  if (koMatch) return koMatch[1] + 'ко'
  const lower = word.toLowerCase()
  for (const [suffix, replacement] of SUFFIX_MAP) {
    if (lower.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length)
      return stem + replacement
    }
  }
  return word
}

export function transliterateName(ukrainianName: string, controllingLatinSpelling?: string): string {
  if (controllingLatinSpelling && controllingLatinSpelling.trim()) {
    return controllingLatinSpelling.trim()
  }
  const nominative = restoreNominative(ukrainianName)
  return transliterateKMU55(nominative)
}
