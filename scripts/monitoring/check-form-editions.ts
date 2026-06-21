import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { supabase } from './lib/supabase-client'

type FormEntry = {
  formId: string
  instructionsPdfUrl: string
}

function extractFormEntries(): FormEntry[] {
  const formsDir = join(process.cwd(), 'apps/web/src/data/formIntelligence')
  const files = ['i131.ts', 'i765.ts', 'i821.ts', 'i912.ts', 'i589.ts', 'g1145.ts', 'ar11.ts']
  const rows: FormEntry[] = []

  for (const file of files) {
    const text = readFileSync(join(formsDir, file), 'utf8')
    const formId = text.match(/formId:\s*'([^']+)'/)?.[1] || file.replace('.ts', '').toUpperCase()
    const instructionsPdfUrl =
      text.match(/instructionsPdfUrl:\s*'([^']+)'/)?.[1] ||
      text.match(/instructions_pdf_url:\s*'([^']+)'/)?.[1] ||
      ''
    if (instructionsPdfUrl) {
      rows.push({ formId, instructionsPdfUrl })
    }
  }

  return rows
}

async function hashRemote(url: string): Promise<string | null> {
  const response = await fetch(url)
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  return createHash('sha256').update(bytes).digest('hex')
}

async function main(): Promise<void> {
  const forms = extractFormEntries()
  let changed = 0

  for (const form of forms) {
    const hash = await hashRemote(form.instructionsPdfUrl)
    if (!hash) {
      await supabase.from('dead_links_log').insert({
        url: form.instructionsPdfUrl,
        referenced_in: `formIntelligence:${form.formId}`,
        detected_dead_at: new Date().toISOString(),
        http_status: 0,
      })
      continue
    }

    const { data: current, error: selectErr } = await supabase
      .from('form_editions')
      .select('id,pdf_hash,edition_date')
      .eq('form_id', form.formId)
      .eq('is_current', true)
      .limit(1)
      .maybeSingle()
    if (selectErr) throw selectErr

    if (!current) {
      const { error } = await supabase.from('form_editions').insert({
        form_id: form.formId,
        edition_date: null,
        pdf_url: form.instructionsPdfUrl,
        pdf_hash: hash,
        is_current: true,
      })
      if (error) throw error
      continue
    }

    if (current.pdf_hash !== hash) {
      const { error: updateErr } = await supabase
        .from('form_editions')
        .update({ is_current: false })
        .eq('id', current.id)
      if (updateErr) throw updateErr

      const { error: insertErr } = await supabase.from('form_editions').insert({
        form_id: form.formId,
        edition_date: null,
        pdf_url: form.instructionsPdfUrl,
        pdf_hash: hash,
        is_current: true,
      })
      if (insertErr) throw insertErr

      const { error: alertErr } = await supabase.from('monitoring_alerts').insert({
        source_id: null,
        alert_type: 'edition_changed',
        severity: 'warning',
        title: `${form.formId} instructions changed`,
        description: `PDF hash changed for ${form.formId}`,
        source_url: form.instructionsPdfUrl,
      })
      if (alertErr) throw alertErr
      changed += 1
    }
  }

  console.log(`Form edition check completed. Changed forms: ${changed}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

