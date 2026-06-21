/**
 * registryLoader.ts — parse registry.csv → RegistryRow[] (the human source of truth).
 * A small RFC-4180-ish CSV parser (handles quoted fields, embedded commas, "" escapes).
 * Aliases cell is pipe-separated.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { REGISTRY_COLUMNS, REGISTRY_CATEGORIES, type RegistryRow, type RegistryCategory } from './registry.schema'

/** Parse one CSV text into rows of string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row) }
  return rows
}

function cleanDate(s: string): string | null {
  const v = (s ?? '').trim()
  return v ? v : null
}

/** Parse raw CSV text → typed RegistryRow[]. */
export function parseRegistry(text: string): RegistryRow[] {
  const matrix = parseCsv(text)
  if (!matrix.length) return []
  const header = matrix[0].map((h) => h.trim())
  // header must match the canonical column order
  for (let i = 0; i < REGISTRY_COLUMNS.length; i++) {
    if (header[i] !== REGISTRY_COLUMNS[i]) {
      throw new Error(`registry.csv header mismatch at col ${i}: expected "${REGISTRY_COLUMNS[i]}", got "${header[i]}"`)
    }
  }
  const out: RegistryRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]
    if (!cells.length || cells.every((c) => c.trim() === '')) continue
    const get = (name: string) => (cells[header.indexOf(name)] ?? '').trim()
    const category = get('category') as RegistryCategory
    out.push({
      category,
      key_uk: get('key_uk'),
      key_ru: get('key_ru'),
      official_en: get('official_en'),
      aliases: get('aliases').split('|').map((a) => a.trim()).filter(Boolean),
      valid_from: cleanDate(get('valid_from')),
      valid_until: cleanDate(get('valid_until')),
      source_url: get('source_url'),
      source_authority: get('source_authority'),
      source_act: get('source_act'),
      confidence_rule: get('confidence_rule') || 'medium',
      review_rule: get('review_rule') || 'auto',
      warning: get('warning'),
      notes: get('notes'),
    })
  }
  return out
}

/** Load registry.csv from disk (Node/test context). */
export function loadRegistry(): RegistryRow[] {
  const dir = dirname(fileURLToPath(import.meta.url))
  const text = readFileSync(resolve(dir, 'registry.csv'), 'utf8')
  return parseRegistry(text)
}

/** Integrity validation — used by tests and a CI gate. Returns list of problems. */
export function validateRegistry(rows: RegistryRow[]): string[] {
  const problems: string[] = []
  rows.forEach((row, i) => {
    const id = `row ${i + 1} [${row.category}/${row.key_uk}]`
    if (!REGISTRY_CATEGORIES.includes(row.category)) problems.push(`${id}: unknown category "${row.category}"`)
    if (!row.source_url) problems.push(`${id}: MISSING source_url`)              // mandatory test #6
    if (!row.official_en && row.review_rule === 'auto') problems.push(`${id}: empty official_en without an explicit review_rule`) // test #5
    if (row.valid_from && !/^\d{4}-\d{2}-\d{2}$/.test(row.valid_from)) problems.push(`${id}: bad valid_from "${row.valid_from}"`)
    if (row.valid_until && !/^\d{4}-\d{2}-\d{2}$/.test(row.valid_until)) problems.push(`${id}: bad valid_until "${row.valid_until}"`)
  })
  return problems
}
