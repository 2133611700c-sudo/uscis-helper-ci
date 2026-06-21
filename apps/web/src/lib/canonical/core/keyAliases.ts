/**
 * keyAliases — ONE declarative registry of equivalent field keys. Phase 1 single-
 * sources the alias knowledge that today is copy-pasted across reParoleAdapter and
 * eadAdapter (mapFieldWithAliases). PURELY MECHANICAL: a primary canonical key with
 * a list of synonym keys that mean the SAME extracted fact. No normalization, no
 * value transformation, no inference — only "these keys are the same field".
 *
 * One primary key is canonical; the rest are accepted aliases when reading.
 */
export const KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // ── required initial set (owner contract) ──
  date_of_birth: ['dob'],
  middle_name: ['patronymic', 'middle_name_cyrillic'],
  passport_expiration_date: ['date_of_expiry', 'expiry_date', 'passport_expiry'],
  a_number: ['alien_registration_number', 'alien_number'],

  // ── mechanical equivalents already used by the existing adapters ──
  country_of_birth: ['place_of_birth', 'country_of_issuance'],
  country_of_nationality: ['nationality', 'citizenship'],
  i94_admission_number: ['admission_number'],
  i94_class_of_admission: ['class_of_admission'],
  i94_date_of_entry: ['date_of_last_entry', 'last_entry_date', 'last_entry'],
  uscis_number: ['uscis_online_account', 'uscis_online_account_number', 'uscis_account_number'],
  family_name: ['family_name_latin'],
  given_name: ['given_name_latin'],
} as const

/** All keys (primary + aliases) that resolve to the given primary key, primary first. */
export function keysFor(primary: string): string[] {
  const aliases = KEY_ALIASES[primary] ?? []
  return [primary, ...aliases]
}

/** Reverse lookup: the primary canonical key a given key belongs to (itself if none). */
export function primaryKeyOf(key: string): string {
  if (KEY_ALIASES[key]) return key
  for (const [primary, aliases] of Object.entries(KEY_ALIASES)) {
    if (aliases.includes(key)) return primary
  }
  return key
}
