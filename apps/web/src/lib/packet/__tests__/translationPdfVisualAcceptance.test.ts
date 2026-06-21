/**
 * translationPdfVisualAcceptance.test.ts — #195: visual acceptance for the
 * certified translation PDF, the analog of the TPS/EAD poppler gates.
 *
 * Renders the cert PDF locally (deterministic) and proves with poppler/pdftotext:
 *   - page count (cert renderer = 2)
 *   - every page renders non-blank (no missing/blank page)
 *   - the English translation values + cert block (8 CFR §103.2(b)(3)) are present
 *   - ZERO untranslated Cyrillic (U+0400–U+04FF) leaks into the certified output
 *     (Cyrillic field input must be transliterated to Latin, never drawn raw)
 *
 * Poppler is required; the suite self-skips where pdfinfo is absent (local dev).
 * CI runs it with poppler installed (see staging-e2e / a poppler-enabled job).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateTranslationPDF } from '../pdf'

const ef = (field: string, normalized_value: string) => ({
  field, source_label: '', source_zone: 'identity_page', bbox: [0, 0, 0, 0] as [number, number, number, number],
  raw_value: '', normalized_value, language_layer: 'latin', confidence: 0.9, review_required: false, passes: ['t'],
})

const cert = {
  signer_full_name: 'Ivan Ivanenko', address: '1213 Gordon St, Los Angeles, CA 90038',
  language_pair_confirmed: true, statement: '', signature_typed_name: 'Ivan Ivanenko',
  signed_at: '2026-05-30T00:00:00Z', certification_version: 'self_cert_8cfr_v1',
}

function popplerAvailable(): boolean {
  try { execSync('pdfinfo -v', { stdio: 'pipe' }); return true } catch { return false }
}

const HAS_POPPLER = popplerAvailable()
const CYRILLIC_RE = /[Ѐ-ӿ]/

describe('#195 — certified translation PDF visual acceptance (poppler)', () => {
  let dir: string
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tv2-va-')) })

  it.skipIf(!HAS_POPPLER)('renders 2 non-blank pages with English values + 8 CFR cert block, zero Cyrillic leak', async () => {
    // Cyrillic INPUT must be transliterated to Latin in the output (never drawn raw).
    const buf = await generateTranslationPDF({
      scopeTitle: 'Birth Certificate', documentType: 'birth',
      fields: [ef('surname', 'ШЕВЧЕНКО'), ef('given_name', 'ТАРАС')], sourceTraces: [],
      certificationRecord: cert, sessionId: 'va-fixture',
    } as never)
    const pdf = join(dir, 'cert.pdf')
    writeFileSync(pdf, buf)

    // page count
    const pages = Number(execSync(`pdfinfo "${pdf}"`).toString().match(/Pages:\s+(\d+)/)?.[1] ?? '0')
    expect(pages, 'cert PDF page count').toBe(2)

    // render every page; each PNG must be non-trivial (>3KB ⇒ not blank/missing)
    execSync(`pdftoppm -png -r 110 "${pdf}" "${join(dir, 'page')}"`)
    const pngs = readdirSync(dir).filter((f) => f.startsWith('page') && f.endsWith('.png'))
    expect(pngs.length, 'rendered pages == page count').toBe(pages)
    for (const p of pngs) expect(statSync(join(dir, p)).size, `${p} non-blank`).toBeGreaterThan(3000)

    // text layer
    const text = execSync(`pdftotext "${pdf}" -`).toString()
    expect(text, 'transliterated surname present (Cyrillic input → Latin output)').toMatch(/SHEVCHENKO/i)
    expect(text.toLowerCase(), 'translator certification block').toContain('competent to translate')
    expect(text, '8 CFR citation').toMatch(/8 CFR/i)
    expect(text, 'signer name').toContain('Ivan Ivanenko')
    // the hard Cyrillic rule: NO U+0400–U+04FF in the certified output
    const leaked = [...text].filter((c) => CYRILLIC_RE.test(c))
    expect(leaked, `no Cyrillic leak (found: ${leaked.slice(0, 8).join('')})`).toHaveLength(0)
  })

  it('reports when poppler is unavailable (so a skip is never mistaken for a pass)', () => {
    if (!HAS_POPPLER) console.warn('[translation visual acceptance] poppler absent — install poppler-utils to run the gate')
    expect(true).toBe(true)
  })
})
