#!/usr/bin/env node
/**
 * check-i18n-drift.mjs — locale-key parity guard.
 *
 * Walks every .tsx file under src/components/tps and
 * src/app/[locale]/services/tps-ukraine looking for COPY objects shaped:
 *
 *   const COPY = {
 *     uk: { … keys … },
 *     ru: { … keys … },
 *     en: { … keys … },
 *     es: { … keys … },
 *   }
 *
 * For each such object it asserts that the four locale branches have
 * identical top-level key sets. Any drift fails the script with exit 1.
 *
 * Why this exists:
 *   COPY drift is silent — a missing key just renders `undefined` in
 *   the UI, and no test ever sees it unless someone happens to click
 *   through that locale. By the time a real Ukrainian or Spanish user
 *   notices, trust is already gone.
 *
 *   This is a heuristic linter, not an AST parser. False positives on
 *   exotic constructs (computed keys, spreads) are acceptable — fix
 *   them by reshaping the COPY object into the locked pattern above.
 */

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const ROOTS = [
  path.join(REPO_ROOT, 'src/components/tps'),
  path.join(REPO_ROOT, 'src/app/[locale]/services/tps-ukraine'),
]
const LOCALES = ['uk', 'ru', 'en', 'es']

let violations = 0

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      out.push(full)
    }
  }
  return out
}

/**
 * Extract per-locale key sets from a file. Returns Map<localeKey, Set<key>>
 * keyed by 'uk'|'ru'|'en'|'es'. Empty map if the file has no COPY-shaped
 * object that mentions all four locales within 20 lines of each other.
 *
 * Heuristic: for each locale, find lines like `  ru: {` then capture
 * keys at the next-indent level until the matching closing `},`.
 */
function extractCopyKeys(src) {
  const lines = src.split('\n')
  const localesSeen = new Set()
  for (const ln of lines) {
    for (const loc of LOCALES) {
      if (new RegExp(`^\\s{2,8}${loc}\\s*:\\s*\\{`).test(ln)) localesSeen.add(loc)
    }
  }
  // Only treat as COPY when all 4 locales appear in the same file.
  if (localesSeen.size !== 4) return null

  const perLocale = new Map(LOCALES.map((l) => [l, new Set()]))

  // Pass 2 — for each locale opening line, scan forward until matching
  // closing `},` at the same indent, capturing top-level keys.
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    let openLoc = null
    let openIndent = 0
    for (const loc of LOCALES) {
      const m = ln.match(new RegExp(`^(\\s{2,8})${loc}\\s*:\\s*\\{`))
      if (m) {
        openLoc = loc
        openIndent = m[1].length
        break
      }
    }
    if (!openLoc) continue

    const innerIndent = openIndent + 2
    const innerKeyRx = new RegExp(`^\\s{${innerIndent}}([a-zA-Z_$][a-zA-Z_$0-9]*)\\s*:`)
    const closeRx = new RegExp(`^\\s{${openIndent}}\\},?\\s*(?://.*)?$`)

    for (let j = i + 1; j < lines.length; j++) {
      if (closeRx.test(lines[j])) break
      const m = lines[j].match(innerKeyRx)
      if (m) perLocale.get(openLoc).add(m[1])
    }
  }
  return perLocale
}

function checkFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8')
  const perLocale = extractCopyKeys(src)
  if (!perLocale) return

  const rel = path.relative(REPO_ROOT, filePath)
  const union = new Set()
  for (const set of perLocale.values()) for (const k of set) union.add(k)

  const missing = []
  for (const loc of LOCALES) {
    const set = perLocale.get(loc)
    for (const k of union) {
      if (!set.has(k)) missing.push({ loc, key: k })
    }
  }

  if (missing.length === 0) {
    console.log(`  ✅  ${rel} — all 4 locales aligned (${union.size} keys)`)
    return
  }

  violations++
  console.log(`  ❌  ${rel} — ${missing.length} drift(s):`)
  for (const m of missing) {
    console.log(`       missing "${m.key}" in locale "${m.loc}"`)
  }
}

console.log('')
console.log('╔══════════════════════════════════════════════════════╗')
console.log('║   TPS i18n drift guard (uk/ru/en/es)                 ║')
console.log('╚══════════════════════════════════════════════════════╝')

const files = []
for (const root of ROOTS) walk(root, files)
console.log(`\n▶ Scanning ${files.length} files under TPS surfaces`)

for (const f of files) checkFile(f)

console.log('')
console.log('══════════════════════════════════════════════════════')
if (violations === 0) {
  console.log('  ✅  i18n drift: 0 violations')
  console.log('══════════════════════════════════════════════════════')
  console.log('')
  process.exit(0)
} else {
  console.log(`  ❌  i18n drift: ${violations} file(s) with missing keys`)
  console.log('      Each missing key renders `undefined` in production.')
  console.log('══════════════════════════════════════════════════════')
  console.log('')
  process.exit(1)
}
