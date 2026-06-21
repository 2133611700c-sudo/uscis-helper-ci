import { supabase } from './lib/supabase-client'
import { sha256 } from './lib/hash'

// ── Types ─────────────────────────────────────────────────────────────────────

type RssItem = {
  title: string
  link: string
  pubDate: string
  guid: string
}

type PageItem = {
  title: string
  link: string
}

type MonitoringSource = {
  id: string
  url: string
  content_hash: string | null
  source_type: string
  title: string | null
}

// ── RSS helpers ───────────────────────────────────────────────────────────────

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  for (const block of blocks) {
    const body = block[1]
    const get = (tag: string) =>
      decodeXml(
        (body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '').trim(),
      )
    const title = get('title')
    const link = get('link')
    const pubDate = get('pubDate')
    const guid = get('guid') || link
    if (title && link) {
      items.push({ title, link, pubDate, guid })
    }
  }
  return items
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

/** Extract USCIS newsroom/form article links from HTML */
function parseUscisPageItems(html: string, baseUrl: string): PageItem[] {
  const items: PageItem[] = []
  const seen = new Set<string>()

  // Match internal USCIS article links with meaningful path depth (≥3 segments)
  const linkRe = /href="(\/(?:newsroom|forms)\/[a-z0-9][a-z0-9/_-]{10,})"[^>]*>([^<]{3,120})</g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1]
    const rawTitle = m[2].trim()
    // Skip nav/pagination links
    if (/\?page=|#|rss-feed|archive|es\/|espa/.test(path)) continue
    if (seen.has(path)) continue
    seen.add(path)
    items.push({ title: rawTitle || path, link: `https://www.uscis.gov${path}` })
  }

  return items.slice(0, 50) // cap to 50 most recent
}

// ── Source processors ─────────────────────────────────────────────────────────

async function processRssSource(source: MonitoringSource): Promise<void> {
  let items: RssItem[] = []
  let fetchOk = true

  try {
    const response = await fetch(source.url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    })
    if (!response.ok) {
      console.warn(`RSS fetch error ${response.status} for ${source.url}`)
      fetchOk = false
    } else {
      const xml = await response.text()
      items = parseRssItems(xml)
    }
  } catch (err) {
    console.warn(`RSS fetch exception for ${source.url}:`, err)
    fetchOk = false
  }

  // Always update last_checked_at regardless of content
  if (!fetchOk || !items.length) {
    console.log(`RSS source "${source.title || source.url}": ${items.length} items — updating last_checked_at`)
    await supabase
      .from('monitoring_sources')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', source.id)
    return
  }

  const feedHash = sha256(
    items.slice(0, 20).map((i) => `${i.guid}|${i.title}|${i.pubDate}`).join('\n'),
  )

  if (feedHash !== source.content_hash) {
    const { error: updateErr } = await supabase
      .from('monitoring_sources')
      .update({
        content_hash: feedHash,
        last_checked_at: new Date().toISOString(),
        last_changed_at: new Date().toISOString(),
      })
      .eq('id', source.id)
    if (updateErr) throw updateErr
  } else {
    await supabase
      .from('monitoring_sources')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', source.id)
  }

  // Insert new alert entries
  const links = items.map((i) => i.link)
  const { data: existingAlerts, error: existingErr } = await supabase
    .from('monitoring_alerts')
    .select('source_url')
    .in('source_url', links)
    .eq('alert_type', 'new_item')
  if (existingErr) throw existingErr

  const seen = new Set(
    ((existingAlerts || []) as Array<{ source_url: string | null }>).map((a) => a.source_url),
  )
  const fresh = items.filter((i) => !seen.has(i.link))
  for (const item of fresh) {
    const { error } = await supabase.from('monitoring_alerts').insert({
      source_id: source.id,
      alert_type: 'new_item',
      severity: 'info',
      title: item.title,
      description: `USCIS RSS item published: ${item.pubDate || 'date unknown'}`,
      source_url: item.link,
    })
    if (error) throw error
  }

  console.log(`RSS source "${source.title || source.url}": ${items.length} items, ${fresh.length} new alerts`)
}

async function processPageSource(source: MonitoringSource): Promise<void> {
  let items: PageItem[] = []
  let fetchOk = true

  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'USCISHelper-Monitor/1.0 (monitoring@uscis-helper.example.com)',
      },
    })
    if (!response.ok) {
      console.warn(`Page fetch error ${response.status} for ${source.url}`)
      fetchOk = false
    } else {
      const html = await response.text()
      items = parseUscisPageItems(html, source.url)
    }
  } catch (err) {
    console.warn(`Page fetch exception for ${source.url}:`, err)
    fetchOk = false
  }

  // Always update last_checked_at
  if (!fetchOk || !items.length) {
    console.log(`Page source "${source.title || source.url}": ${items.length} items — updating last_checked_at`)
    await supabase
      .from('monitoring_sources')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', source.id)
    return
  }

  const pageHash = sha256(items.map((i) => i.link).join('\n'))

  if (pageHash !== source.content_hash) {
    const { error: updateErr } = await supabase
      .from('monitoring_sources')
      .update({
        content_hash: pageHash,
        last_checked_at: new Date().toISOString(),
        last_changed_at: new Date().toISOString(),
      })
      .eq('id', source.id)
    if (updateErr) throw updateErr

    // Insert a single "content changed" alert per source
    const { error: alertErr } = await supabase.from('monitoring_alerts').insert({
      source_id: source.id,
      alert_type: 'content_changed',
      severity: 'info',
      title: `Content updated: ${source.title || source.url}`,
      description: `USCIS page link list changed. ${items.length} article links now visible.`,
      source_url: source.url,
    })
    if (alertErr) throw alertErr

    console.log(`Page source "${source.title || source.url}": content changed, ${items.length} links`)
  } else {
    await supabase
      .from('monitoring_sources')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', source.id)
    console.log(`Page source "${source.title || source.url}": no change, ${items.length} links — last_checked_at updated`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Process all uscis_rss sources
  const { data: rssSources, error: rssErr } = await supabase
    .from('monitoring_sources')
    .select('id,url,content_hash,source_type,title')
    .eq('source_type', 'uscis_rss')
    .eq('status', 'active')

  if (rssErr) throw rssErr

  if (!rssSources || rssSources.length === 0) {
    console.log('No active uscis_rss sources found.')
  } else {
    for (const source of rssSources) {
      await processRssSource(source as MonitoringSource)
    }
  }

  // Process all uscis_page sources
  const { data: pageSources, error: pageErr } = await supabase
    .from('monitoring_sources')
    .select('id,url,content_hash,source_type,title')
    .eq('source_type', 'uscis_page')
    .eq('status', 'active')

  if (pageErr) throw pageErr

  if (!pageSources || pageSources.length === 0) {
    console.log('No active uscis_page sources found.')
  } else {
    for (const source of pageSources) {
      await processPageSource(source as MonitoringSource)
    }
  }

  console.log('USCIS monitor completed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
