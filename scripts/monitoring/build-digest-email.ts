import { sendDigest } from './lib/email'
import { supabase } from './lib/supabase-client'

type AlertRow = {
  id: string
  alert_type: 'new_item' | 'content_changed' | 'dead_link' | 'edition_changed'
  severity: 'info' | 'warning' | 'critical'
  title: string | null
  description: string | null
  source_url: string | null
  detected_at: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function section(title: string, items: AlertRow[]): string {
  if (!items.length) return ''
  return `
  <h2 style="font-size:16px; margin:24px 0 8px 0;">${escapeHtml(title)} (${items.length})</h2>
  <ul style="padding-left:20px; margin:0;">
    ${items
      .map((item) => {
        const label = item.title || item.description || item.alert_type
        const safeLabel = escapeHtml(label)
        if (item.source_url) {
          return `<li style="margin:6px 0;"><a href="${item.source_url}">${safeLabel}</a></li>`
        }
        return `<li style="margin:6px 0;">${safeLabel}</li>`
      })
      .join('\n')}
  </ul>
  `
}

async function main(): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('monitoring_alerts')
    .select('id,alert_type,severity,title,description,source_url,detected_at')
    .is('acknowledged_at', null)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })

  if (error) throw error

  const alerts = (data || []) as AlertRow[]
  if (!alerts.length) {
    console.log('No unacknowledged alerts in last 24h. Skipping digest email.')
    return
  }

  const critical = alerts.filter((a) => a.severity === 'critical')
  const news = alerts.filter((a) => a.alert_type === 'new_item' && (a.title || '').includes('USCIS'))
  const federal = alerts.filter((a) => a.alert_type === 'new_item' && (a.title || '').toLowerCase().includes('federal'))
  const forms = alerts.filter((a) => a.alert_type === 'edition_changed')
  const dead = alerts.filter((a) => a.alert_type === 'dead_link')
  const youtube = alerts.filter((a) => (a.title || '').startsWith('[YouTube]'))

  const now = new Date()
  const subject = `Messenginfo Monitor — ${now.toISOString().slice(0, 10)}`
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
  <h1 style="font-size:22px;margin:0 0 8px 0;">Messenginfo Monitor</h1>
  <p style="color:#64748b;margin:0 0 24px 0;">${escapeHtml(now.toDateString())}</p>
  ${section('⚠️ Action required', critical)}
  ${section('USCIS News', news)}
  ${section('Federal Register', federal)}
  ${section('Form edition changes', forms)}
  ${section('Dead links', dead)}
  ${section('YouTube new videos', youtube)}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px 0;">
  <p style="color:#64748b;font-size:12px;">
    Messenginfo automated monitoring · Generated ${escapeHtml(now.toISOString())}
  </p>
</body>
</html>`

  await sendDigest(html, subject)
  console.log(`Digest built. Alerts included: ${alerts.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

