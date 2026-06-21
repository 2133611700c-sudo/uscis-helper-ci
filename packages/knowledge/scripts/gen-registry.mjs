#!/usr/bin/env node
/**
 * gen-registry.mjs — compile registry.csv (human source) → registry.generated.ts
 * (runtime representation). Run whenever registry.csv changes:
 *   node packages/knowledge/scripts/gen-registry.mjs
 * This keeps the agent's runtime free of any fs read (serverless-safe on Vercel).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const csvPath = resolve(dir, '../src/registry/registry.csv')
const outPath = resolve(dir, '../src/registry/registry.generated.ts')

function parseCsv(text) {
  const rows = []; let field = ''; let row = []; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [] }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row) }
  return rows
}

const text = readFileSync(csvPath, 'utf8')
const matrix = parseCsv(text)
const header = matrix[0].map((h) => h.trim())
const rows = matrix.slice(1).filter((c) => c.length && !c.every((x) => x.trim() === '')).map((cells) => {
  const get = (n) => (cells[header.indexOf(n)] ?? '').trim()
  return {
    category: get('category'), key_uk: get('key_uk'), key_ru: get('key_ru'), official_en: get('official_en'),
    aliases: get('aliases').split('|').map((a) => a.trim()).filter(Boolean),
    valid_from: get('valid_from') || null, valid_until: get('valid_until') || null,
    source_url: get('source_url'), source_authority: get('source_authority'), source_act: get('source_act'),
    confidence_rule: get('confidence_rule') || 'medium', review_rule: get('review_rule') || 'auto',
    warning: get('warning'), notes: get('notes'),
  }
})

const banner = `/* AUTO-GENERATED from registry.csv by scripts/gen-registry.mjs — DO NOT EDIT BY HAND.\n   Edit registry.csv (human source) then re-run the generator. */\n`
const body = `import type { RegistryRow } from './registry.schema'\n\nexport const REGISTRY_ROWS: RegistryRow[] = ${JSON.stringify(rows, null, 2)} as RegistryRow[]\n`
writeFileSync(outPath, banner + body)
console.log(`generated ${outPath} with ${rows.length} rows`)
