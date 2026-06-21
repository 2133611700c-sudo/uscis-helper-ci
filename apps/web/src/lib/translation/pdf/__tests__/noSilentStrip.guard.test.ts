/**
 * noSilentStrip.guard.test.ts — class-level guard against the silent data-loss
 * anti-pattern returning. The bureau PDF path twice carried
 *   const safe = (t) => t.replace(/[^\x00-\xFF]/g, '')
 * which silently DELETED every char > U+00FF (Cyrillic series → gone). The fix is
 * the shared renderValueForPdf/pdfSafe (transliterate, then visibly mark — never
 * delete). This test fails if any production renderer reintroduces a silent strip.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PDF_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
// renderValue.ts legitimately names the anti-pattern in its doc comment; tests too.
const ALLOW = new Set(['renderValue.ts'])

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...tsFiles(p))
    } else if (name.endsWith('.ts') && !ALLOW.has(name)) {
      out.push(p)
    }
  }
  return out
}

describe('PDF renderers — no silent non-ASCII strip (class guard)', () => {
  it('no production renderer deletes non-WinAnsi chars silently', () => {
    const offenders: string[] = []
    for (const f of tsFiles(PDF_DIR)) {
      const src = readFileSync(f, 'utf8')
      // the executable silent-delete: replace(/[^...]/, '') over the >U+00FF range
      if (/replace\(\s*\/\[\^\\x00-\\xFF\]\/[a-z]*\s*,\s*['"]['"]\s*\)/.test(src)) {
        offenders.push(f.replace(PDF_DIR, '…/pdf'))
      }
    }
    expect(offenders, `silent-strip reintroduced — route values through pdfSafe instead:\n${offenders.join('\n')}`).toEqual([])
  })
})
