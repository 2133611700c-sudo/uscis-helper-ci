#!/usr/bin/env tsx
/**
 * gen-settlements.mts — compile the official КАТОТТГ city list → a machine layer
 * of registry settlement rows (English via KMU-55). Keeps the human-curated
 * registry.csv small; the bulk geography lives here, regenerable from source.
 *
 * SOURCE: КАТОТТГ (Codifier), Наказ Мінрегіону №290 від 26.11.2020,
 *   https://mtu.gov.ua/content/kodifikator-administrativnoteritorialnih-odinic-ta-teritoriy-teritorialnih-gromad.html
 * Re-run (download the КАТОТТГ JSON first):
 *   curl -sL https://raw.githubusercontent.com/kaminarifox/katottg-json/master/katottg.min.json -o /tmp/katottg.json
 *   KATOTTG_JSON=/tmp/katottg.json npx tsx packages/knowledge/scripts/gen-settlements.mts
 *
 * Ingests categories M (cities) + K (special-status cities). Villages (C) and
 * rural settlements (X) are NOT ingested (28k rows) — they keep the fuzzy gazetteer.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const { transliterateKMU55 } = await import('../src/transliterate.ts')

const dir = dirname(fileURLToPath(import.meta.url))
const SRC = process.env.KATOTTG_JSON || '/tmp/katottg.json'
const OUT = resolve(dir, '../src/registry/settlements.generated.ts')

const d = JSON.parse(readFileSync(SRC, 'utf8')) as {
  orderDate: string
  items: Array<{ level1: string; category: string; name: string }>
}

const oblastByCode: Record<string, string> = {}
for (const i of d.items) if (i.category === 'O') oblastByCode[i.level1] = i.name

const rows: any[] = []
const seen = new Set<string>()
for (const i of d.items) {
  if (i.category !== 'M' && i.category !== 'K') continue
  const name = (i.name || '').trim()
  if (!name) continue
  const key = name.toLocaleLowerCase('uk')
  if (seen.has(key)) continue // first occurrence wins (rare dup city names across oblasts)
  seen.add(key)
  const oblast = (oblastByCode[i.level1] || '').replace(/\s*область$/u, '').trim()
  rows.push({
    category: 'settlement', key_uk: name, key_ru: '', official_en: transliterateKMU55(name), aliases: [],
    valid_from: '2020-11-26', valid_until: null,
    source_url: 'https://mtu.gov.ua/content/kodifikator-administrativnoteritorialnih-odinic-ta-teritoriy-teritorialnih-gromad.html',
    source_authority: 'Мінрегіон', source_act: 'КАТОТТГ, Наказ Мінрегіону №290 від 26.11.2020',
    confidence_rule: 'high', review_rule: 'auto', warning: '', notes: oblast,
  })
}

const banner = `/* AUTO-GENERATED from КАТОТТГ (mtu.gov.ua, orderDate ${d.orderDate}) by scripts/gen-settlements.mts — DO NOT EDIT BY HAND. */\n`
const body = `import type { RegistryRow } from './registry.schema'\n\nexport const SETTLEMENT_ROWS: RegistryRow[] = ${JSON.stringify(rows)} as RegistryRow[]\n`
writeFileSync(OUT, banner + body)
console.log(`generated ${rows.length} city rows → ${OUT}`)
