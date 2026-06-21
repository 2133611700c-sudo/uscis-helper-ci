import { readFileSync } from 'fs'
import { join } from 'path'
import { supabase } from './lib/supabase-client'

type LinkRecord = {
  url: string
  referencedIn: string
}

const URL_RE = /https:\/\/[^\s'"`),\]}]+/g

function extractUrls(path: string, referencedIn: string): LinkRecord[] {
  const content = readFileSync(path, 'utf8')
  const found: string[] = content.match(URL_RE) || []
  return found.map((url) => ({ url, referencedIn }))
}

function collectLinks(): LinkRecord[] {
  const root = process.cwd()
  const files = [
    ['apps/web/src/data/serviceCards.ts', 'serviceCards'],
    ['apps/web/src/data/painPoints.ts', 'painPoints'],
    ['apps/web/src/data/misinformation.ts', 'misinformation'],
    ['apps/web/src/data/faqAnswers.ts', 'faqAnswers'],
    ['apps/web/src/data/formIntelligence/i131.ts', 'formIntelligence:i131'],
    ['apps/web/src/data/formIntelligence/i765.ts', 'formIntelligence:i765'],
    ['apps/web/src/data/formIntelligence/i821.ts', 'formIntelligence:i821'],
    ['apps/web/src/data/formIntelligence/i912.ts', 'formIntelligence:i912'],
    ['apps/web/src/data/formIntelligence/i589.ts', 'formIntelligence:i589'],
    ['apps/web/src/data/formIntelligence/g1145.ts', 'formIntelligence:g1145'],
    ['apps/web/src/data/formIntelligence/ar11.ts', 'formIntelligence:ar11'],
  ] as const

  const list: LinkRecord[] = []
  for (const [relativePath, name] of files) {
    list.push(...extractUrls(join(root, relativePath), name))
  }
  const dedup = new Map<string, LinkRecord>()
  for (const item of list) {
    dedup.set(`${item.url}__${item.referencedIn}`, item)
  }
  return [...dedup.values()]
}

async function checkUrl(url: string): Promise<number> {
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null)
  if (head && head.status >= 200 && head.status < 400) return head.status
  const get = await fetch(url, { method: 'GET' }).catch(() => null)
  return get?.status ?? 0
}

function isAllowedBotProtected(url: string, status: number): boolean {
  if (status !== 403) return false
  return url.includes('uscis.gov') || url.includes('justice.gov')
}

async function main(): Promise<void> {
  const links = collectLinks()
  let dead = 0

  for (const entry of links) {
    const status = await checkUrl(entry.url)
    if ((status >= 200 && status < 400) || isAllowedBotProtected(entry.url, status)) {
      continue
    }
    dead += 1
    const { error } = await supabase.from('dead_links_log').insert({
      url: entry.url,
      referenced_in: entry.referencedIn,
      detected_dead_at: new Date().toISOString(),
      http_status: status,
    })
    if (error) throw error

    await supabase.from('monitoring_alerts').insert({
      source_id: null,
      alert_type: 'dead_link',
      severity: status === 0 || status >= 500 ? 'critical' : 'warning',
      title: `Dead link detected (${status})`,
      description: `${entry.url} referenced in ${entry.referencedIn}`,
      source_url: entry.url,
    })
  }

  console.log(`Dead link checker completed. Dead links: ${dead}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
