/**
 * adapterContract — the contract every product adapter (Translation rows / I-821 /
 * I-131 / I-765) must satisfy to read document-derived values from canonical.
 *
 * An adapter is a DUMB key-mapper: it declares which canonical key feeds each output
 * field (with an optional declarative source-gate, e.g. EAD's "a_number only from an
 * EAD/I-797 doc"), and the shared engine resolves values through fieldAccessor ONLY.
 *
 * By construction the engine performs NO transliteration, NO normalization, NO
 * dictionary lookup, NO MRZ override, NO inference, NO review downgrade, NO field
 * correction — it just reads canonical values by key/alias. That is the whole point:
 * once arbitration produced the canonical value, no consumer may change it.
 */
import type { CanonicalDocumentResult } from '../types'
import { getValueByAliases } from './fieldAccessor'

export interface CanonicalFieldMapEntry {
  /** Output field name on the product answer object / PDF op input. */
  out: string
  /** Primary canonical key (aliases resolved via keyAliases). */
  canonicalKey: string
  /** Optional: only accept this field when the source document type qualifies. */
  sourceGate?: (docType: string) => boolean
}

export type CanonicalFieldMap = ReadonlyArray<CanonicalFieldMapEntry>

export interface CanonicalAdapterResult {
  /** out-field → resolved canonical value (only keys that had a value are present). */
  values: Record<string, string>
  /** out-fields whose canonical field is review-required. */
  reviewFields: string[]
}

/**
 * Apply a declarative field map to a canonical result, purely. The ONLY logic is
 * key/alias resolution + the optional declared source-gate. No value is transformed.
 */
export function applyCanonicalFieldMap(
  result: CanonicalDocumentResult,
  map: CanonicalFieldMap,
): CanonicalAdapterResult {
  const values: Record<string, string> = {}
  const reviewFields: string[] = []
  for (const entry of map) {
    if (entry.sourceGate && !entry.sourceGate(result.docType)) continue
    const { value, reviewRequired } = getValueByAliases(result, entry.canonicalKey)
    if (value !== null) values[entry.out] = value
    if (reviewRequired) reviewFields.push(entry.out)
  }
  return { values, reviewFields }
}
