import { supabase } from './lib/supabase-client'

type FeedEntry = {
  id: string
  title: string
  link: string
  published: string
}

function parseFeed(xml: string): FeedEntry[] {
  const blocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
  const entries: FeedEntry[] = []
  for (const block of blocks) {
    const body = block[1]
    const id = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || body.match(/<id>([^<]+)<\/id>/)?.[1] || ''
    const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || ''
    const link = body.match(/<link[^>]*href="([^"]+)"/)?.[1] || ''
    const published = body.match(/<published>([^<]+)<\/published>/)?.[1] || ''
    if (id && title && link) {
      entries.push({ id, title, link, published })
    }
  }
  return entries
}

async function main(): Promise<void> {
  const { data: sources, error } = await supabase
    .from('monitoring_sources')
    .select('id,url,last_seen_id,title,last_changed_at')
    .eq('source_type', 'youtube_rss')
    .eq('status', 'active')
  if (error) throw error

  if (!sources?.length) {
    console.log('No active youtube_rss sources.')
    return
  }

  let inserted = 0

  for (const source of sources) {
    const response = await fetch(source.url)
    if (!response.ok) {
      console.warn(`Feed fetch failed (${response.status}): ${source.url}`)
      continue
    }
    const xml = await response.text()
    const entries = parseFeed(xml)
    if (!entries.length) continue

    const latestId = entries[0].id
    const newEntries: FeedEntry[] = []
    for (const entry of entries) {
      if (source.last_seen_id && entry.id === source.last_seen_id) break
      newEntries.push(entry)
    }

    for (const entry of newEntries.reverse()) {
      const { error: insertError } = await supabase.from('monitoring_alerts').insert({
        source_id: source.id,
        alert_type: 'new_item',
        severity: 'info',
        title: `[YouTube] ${entry.title}`,
        description: `${source.title || source.url} published ${entry.published}`,
        source_url: entry.link,
      })
      if (insertError) throw insertError
      inserted += 1
    }

    const { error: updateError } = await supabase
      .from('monitoring_sources')
      .update({
        last_seen_id: latestId,
        last_checked_at: new Date().toISOString(),
        last_changed_at: newEntries.length ? new Date().toISOString() : source.last_changed_at,
      })
      .eq('id', source.id)
    if (updateError) throw updateError
  }

  console.log(`YouTube monitor completed. New videos inserted: ${inserted}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
