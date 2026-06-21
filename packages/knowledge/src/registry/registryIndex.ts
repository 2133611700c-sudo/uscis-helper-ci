/**
 * registryIndex.ts — compile RegistryRow[] into fast lookup structures for the agent.
 * Built ONCE (lazy singleton). The CSV is the human source; this is the machine view.
 */
import { REGISTRY_ROWS } from './registry.generated'
import { SETTLEMENT_ROWS } from './settlements.generated' // КАТОТТГ city layer (machine-generated)
import { type RegistryRow, type RegistryCategory, REGISTRY_CATEGORIES } from './registry.schema'

/** Normalize a Cyrillic key for matching: lowercase (uk), trim, collapse spaces. */
export function normKey(s: string): string {
  return (s ?? '').toLocaleLowerCase('uk').replace(/\s+/g, ' ').trim()
}

export interface RegistryIndex {
  rows: RegistryRow[]
  byCategory: Map<RegistryCategory, RegistryRow[]>
  /** category → normalizedKeyOrAlias → rows (a key can map to >1 row across eras). */
  exact: Map<RegistryCategory, Map<string, RegistryRow[]>>
}

export function buildIndex(rows: RegistryRow[]): RegistryIndex {
  const byCategory = new Map<RegistryCategory, RegistryRow[]>()
  const exact = new Map<RegistryCategory, Map<string, RegistryRow[]>>()
  for (const cat of REGISTRY_CATEGORIES) { byCategory.set(cat, []); exact.set(cat, new Map()) }
  for (const row of rows) {
    if (!byCategory.has(row.category)) { byCategory.set(row.category, []); exact.set(row.category, new Map()) }
    byCategory.get(row.category)!.push(row)
    const keyMap = exact.get(row.category)!
    const keys = [row.key_uk, row.key_ru, ...row.aliases].map(normKey).filter(Boolean)
    for (const k of new Set(keys)) {
      const arr = keyMap.get(k) ?? []
      arr.push(row)
      keyMap.set(k, arr)
    }
  }
  return { rows, byCategory, exact }
}

let _index: RegistryIndex | null = null
/** Lazy singleton index. Human-curated rows FIRST (priority on exact-key conflicts),
 *  then the КАТОТТГ city layer. No fs at runtime → serverless-safe. */
export function getIndex(): RegistryIndex {
  if (!_index) _index = buildIndex([...REGISTRY_ROWS, ...SETTLEMENT_ROWS])
  return _index
}
/** Test hook: build an index from explicit rows (no disk read). */
export function setIndexForTest(rows: RegistryRow[]): void {
  _index = buildIndex(rows)
}
