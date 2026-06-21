#!/usr/bin/env node
/**
 * verify-ukraine-sources.mjs — deterministic verification of the official
 * Ukrainian document sources (Playbook Prompt 3). A source is NOT "verified" just
 * because a URL exists — its fetched page must contain the act number and the
 * expected keywords. zakon.rada serves stale CDN pages, so we verify the content.
 *
 * Output: docs/official-forms/ukraine/source-verification-report.json
 * Usage:  node scripts/verify-ukraine-sources.mjs   (needs network; offline → unreachable)
 * Exit:   0 always (reporting tool). Prints verified / invalid / unreachable counts.
 *
 * NOTE: military / education / pension URLs are known-INVALID (prior guesses
 * resolved to different acts). They are listed so the report stays honest and the
 * owner can supply correct official URLs.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'Mozilla/5.0 (compatible; messenginfo-source-verifier/1.0)'

// Canonical official sources. `print` is the server-rendered /print variant.
const SOURCES = [
  { id: 'ua_kmu_1025_2010', expectNumber: '1025', keywords: ['1025', '2010'], status_hint: 'verified',
    url: 'https://zakon.rada.gov.ua/laws/show/1025-2010-п/print' },
  { id: 'ua_kmu_152_2014', expectNumber: '152', keywords: ['152', '2014'], status_hint: 'verified',
    url: 'https://zakon.rada.gov.ua/laws/show/152-2014-п/print' },
  { id: 'ua_kmu_302_2015', expectNumber: '302', keywords: ['302', '2015'], status_hint: 'verified',
    url: 'https://zakon.rada.gov.ua/laws/show/302-2015-п/print' },
  { id: 'military_id', expectNumber: '', keywords: [], status_hint: 'invalid_url',
    url: null, note: 'no correct official URL yet (prior guess z0502-17 was a different act)' },
  { id: 'education_diploma', expectNumber: '', keywords: [], status_hint: 'invalid_url',
    url: null, note: 'no correct official URL yet (prior guess z0156-21 was a different act)' },
  { id: 'pension_certificate', expectNumber: '', keywords: [], status_hint: 'invalid_url',
    url: null, note: 'no correct official URL yet (prior guess z1426-17 was a different act)' },
]

/** Extract the <title> text from raw HTML. Pure — unit-testable. */
export function extractTitle(html) {
  const m = (html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

/** Does the fetched content match the expected act number + keywords? Pure. */
export function matchesExpected(html, src) {
  const title = extractTitle(html)
  const hay = (title + ' ' + (html || '')).toLowerCase()
  const numberOk = !src.expectNumber || hay.includes(src.expectNumber.toLowerCase())
  const keywordsOk = (src.keywords || []).every((k) => hay.includes(String(k).toLowerCase()))
  return { title, numberOk, keywordsOk, ok: numberOk && keywordsOk }
}

async function verifyOne(src) {
  if (!src.url) return { id: src.id, status: 'invalid_url', note: src.note || '' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(src.url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { id: src.id, url: src.url, status: 'unreachable', http: res.status }
    const html = await res.text()
    const m = matchesExpected(html, src)
    return { id: src.id, url: src.url, status: m.ok ? 'verified' : 'mismatch', title: m.title, numberOk: m.numberOk, keywordsOk: m.keywordsOk }
  } catch (e) {
    return { id: src.id, url: src.url, status: 'unreachable', error: String(e && e.message || e).slice(0, 80) }
  }
}

async function main() {
  const results = []
  for (const s of SOURCES) results.push(await verifyOne(s))
  const count = (st) => results.filter((r) => r.status === st).length
  const report = {
    generated_by: 'scripts/verify-ukraine-sources.mjs',
    note: 'A source is verified only if its fetched page contains the act number + keywords. Offline → unreachable.',
    summary: { verified: count('verified'), mismatch: count('mismatch'), unreachable: count('unreachable'), invalid_url: count('invalid_url') },
    sources: results,
  }
  mkdirSync(join(ROOT, 'docs/official-forms/ukraine'), { recursive: true })
  writeFileSync(join(ROOT, 'docs/official-forms/ukraine/source-verification-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`sources: ${report.summary.verified} verified, ${report.summary.mismatch} mismatch, ${report.summary.unreachable} unreachable, ${report.summary.invalid_url} invalid_url → docs/official-forms/ukraine/source-verification-report.json`)
}

// Run only as a script, not when imported by the unit test.
if (import.meta.url === `file://${process.argv[1]}`) main()
