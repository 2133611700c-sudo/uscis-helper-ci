import { supabase } from './lib/supabase-client'

type FederalRegisterDoc = {
  document_number: string
  title: string
  html_url: string
  publication_date: string
  type?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchFederalDocs(): Promise<FederalRegisterDoc[]> {
  const userAgent = process.env.FEDERAL_REGISTER_USER_AGENT || 'Messenginfo Monitoring/1.0 (contact@messenginfo.com)'
  const url = 'https://www.federalregister.gov/api/v1/documents?conditions%5Bterm%5D=TPS+OR+parole&per_page=100'
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } })

  if (response.status === 429) {
    await sleep(2000)
    const retry = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } })
    if (!retry.ok) throw new Error(`Federal Register retry failed: ${retry.status}`)
    const body = await retry.json()
    return body.results || []
  }

  if (!response.ok) {
    throw new Error(`Federal Register fetch failed: ${response.status}`)
  }

  const body = await response.json()
  return body.results || []
}

async function main(): Promise<void> {
  const docs = await fetchFederalDocs()

  const { data: source, error: sourceError } = await supabase
    .from('monitoring_sources')
    .select('id')
    .eq('source_type', 'federal_register')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (sourceError) throw sourceError

  const filtered = docs.filter((d) => {
    const hay = `${d.title} ${d.type || ''}`.toLowerCase()
    return hay.includes('tps') || hay.includes('parole') || hay.includes('temporary protected status')
  })

  if (!filtered.length) {
    console.log('Federal Register monitor done. No relevant docs.')
    return
  }

  const urls = filtered.map((d) => d.html_url).filter(Boolean)
  const { data: existing, error: existingError } = await supabase
    .from('monitoring_alerts')
    .select('source_url')
    .in('source_url', urls)
    .eq('alert_type', 'new_item')
  if (existingError) throw existingError

  const known = new Set(((existing || []) as Array<{ source_url: string | null }>).map((r) => r.source_url))
  let inserted = 0
  for (const doc of filtered) {
    if (!doc.html_url || known.has(doc.html_url)) continue
    const { error } = await supabase.from('monitoring_alerts').insert({
      source_id: source?.id || null,
      alert_type: 'new_item',
      severity: 'warning',
      title: doc.title,
      description: `Federal Register update: ${doc.document_number} (${doc.publication_date})`,
      source_url: doc.html_url,
    })
    if (error) throw error
    inserted += 1
    await sleep(1000)
  }

  console.log(`Federal Register monitor done. New items inserted: ${inserted}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
