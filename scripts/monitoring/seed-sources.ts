import { readFileSync } from 'fs'
import { resolve } from 'path'
import { supabase } from './lib/supabase-client'

type SeedRow = {
  source_type: 'uscis_rss' | 'uscis_page' | 'federal_register' | 'youtube_rss' | 'form_page'
  url: string
  title: string
  notes: string
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  out.push(current.trim())
  return out
}

function loadSeedRows(): SeedRow[] {
  const candidates = [
    resolve(process.cwd(), 'tasks/TASK-06-monitoring-engine/data/monitoring-sources-seed.csv'),
    resolve(process.cwd(), 'data/monitoring-sources-seed.csv'),
  ]

  const path = candidates.find((candidate) => {
    try {
      readFileSync(candidate, 'utf8')
      return true
    } catch {
      return false
    }
  })

  if (!path) {
    throw new Error('Seed CSV not found in expected paths.')
  }

  const csv = readFileSync(path, 'utf8')
  const lines: string[] = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const [header, ...rows] = lines
  if (!header.startsWith('source_type,url,title,notes')) {
    throw new Error(`Unexpected CSV header: ${header}`)
  }

  const parsed = rows.map((row: string) => {
    const [source_type, url, title, notes = ''] = parseCsvLine(row)
    return {
      source_type: source_type as SeedRow['source_type'],
      url,
      title,
      notes,
    }
  })

  const hasFederalRegister = parsed.some((row) => row.source_type === 'federal_register')
  if (!hasFederalRegister) {
    parsed.push({
      source_type: 'federal_register',
      url: 'https://www.federalregister.gov/api/v1/documents?conditions%5Bterm%5D=TPS+OR+parole&per_page=100',
      title: 'Federal Register TPS/parole API',
      notes: 'Auto-added by seed script because source CSV has no federal_register row',
    })
  }

  return parsed
}

async function main(): Promise<void> {
  const rows = loadSeedRows()
  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const { data: exists, error: selectError } = await supabase
      .from('monitoring_sources')
      .select('id')
      .eq('url', row.url)
      .limit(1)
      .maybeSingle()
    if (selectError) throw selectError
    if (exists) {
      skipped += 1
      continue
    }

    const { error: insertError } = await supabase.from('monitoring_sources').insert({
      source_type: row.source_type,
      url: row.url,
      title: row.title,
      notes: row.notes || null,
      status: 'active',
    })
    if (insertError) throw insertError
    inserted += 1
  }

  console.log(`Seed completed. Inserted: ${inserted}, skipped(existing): ${skipped}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
