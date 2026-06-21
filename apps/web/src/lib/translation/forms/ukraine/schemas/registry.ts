/**
 * Official UA schema registry — the single docType → OfficialFormSchema lookup.
 *
 * Until now the schemas existed as separate files with NO index, so nothing could
 * resolve "given this docType, what is its official mirror structure?". This is the
 * missing brick that lets the live translation flow render a faithful English
 * MIRROR of the Ukrainian document (per its normative source) instead of a generic
 * field table. Each schema already carries its officialSource (KMU act) — no
 * schema, no mirror.
 */
import type { OfficialFormSchema } from './types'
import { birthCertificateSchema } from './birth-certificate.schema'
import { marriageCertificateSchema } from './marriage-certificate.schema'
import { divorceCertificateSchema } from './divorce-certificate.schema'
import { deathCertificateSchema } from './death-certificate.schema'
import { militaryIdSchema } from './military-id.schema'
import { nameChangeCertificateSchema } from './name-change-certificate.schema'
import { internalPassportSchema } from './internal-passport.schema'
import { internationalPassportSchema } from './international-passport.schema'
import { idCardSchema } from './id-card.schema'

// All official mirror schemas, REGISTERED (resolve unconditionally). The 3
// passport schemas were previously staged behind PASSPORT_SCHEMA_RENDERER_ENABLED;
// registered 2026-06-12 (owner: "возьми паспорта") — their keys match the docintel
// extraction names and the SUPPRESSION INVARIANT (MRZ/personal_number/rnokpp not
// declared) is preserved in the schema files. They render the mirror by default
// via MIRROR_READY_DOCTYPES (generate-pdf), fail-open to the legacy PDF.
const OFFICIAL_SCHEMAS: Record<string, OfficialFormSchema> = {
  ua_birth_certificate: birthCertificateSchema,
  ua_marriage_certificate: marriageCertificateSchema,
  ua_divorce_certificate: divorceCertificateSchema,
  ua_death_certificate: deathCertificateSchema,
  ua_name_change_certificate: nameChangeCertificateSchema,
  ua_military_id: militaryIdSchema,
  ua_internal_passport_booklet: internalPassportSchema,
  ua_international_passport: internationalPassportSchema,
  ua_id_card: idCardSchema,
}

/** Resolve the official mirror schema for a docType, or null if none exists. */
export function getOfficialSchema(docType: string | null | undefined): OfficialFormSchema | null {
  if (!docType) return null
  return OFFICIAL_SCHEMAS[docType] ?? null
}

/** True when a faithful mirror PDF can be rendered for this docType. */
export function hasOfficialSchema(docType: string | null | undefined): boolean {
  return getOfficialSchema(docType) !== null
}

/** All docTypes that have an official mirror schema (for diagnostics/tests). */
export function officialSchemaDocTypes(): string[] {
  return Object.keys(OFFICIAL_SCHEMAS)
}
