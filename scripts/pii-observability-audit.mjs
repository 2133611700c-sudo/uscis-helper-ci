#!/usr/bin/env node
/**
 * pii-observability-audit.mjs — Phase 1 / Agent 4 (independent final gate).
 *
 * PII OBSERVABILITY AUDIT. Scans the repository's OBSERVABLE surfaces — console
 * statements, log emitters, tracked diagnostic/report files, and committed test
 * snapshots — for OWNER PII categories. It reports ONLY:
 *     <file>  PII_PRESENT|CLEAN  [category,...]   (+ line numbers, NEVER the value)
 * It NEVER prints a matched value. It never reads the gitignored real-doc
 * fixtures or .env.local (those are excluded by path). Synthetic markers are
 * used by the self-test (piiObservabilityAudit.test.ts) to prove the detector
 * actually fires.
 *
 * Scope of "observable":
 *   - console.{log,info,warn,error,debug}(...) call SITES (a leaked PII var here
 *     reaches the server log / browser console),
 *   - tracked Markdown/CSV/JSON under docs/reports, daily-briefing*.md, and any
 *     *.snap / inline snapshot files,
 *   - it does NOT flag pure type/interface field NAMES (e.g. `a_number:` in a TS
 *     interface) — those are schema, not values. It flags VALUE-SHAPED literals.
 *
 * Exit code: 0 always (this is a REPORT, not a gate that fails the build). The
 * Phase-B coordinator decides what to do with PII_PRESENT findings. Use
 *   node scripts/pii-observability-audit.mjs            # human report
 *   node scripts/pii-observability-audit.mjs --json     # machine report
 *   node scripts/pii-observability-audit.mjs --self-test # run built-in markers
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// ── Paths NEVER scanned (they legitimately contain real values, are gitignored,
//    or are this auditor's own self-test markers). ────────────────────────────
const EXCLUDE_DIRS = [
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  'test-fixtures/real-docs', // gitignored real docs (symlink) — must never be read
  'qa-shots/private',        // gitignored private screenshots (symlink)
]
const EXCLUDE_FILE_SUBSTR = [
  '.env',                          // secrets/keys
  'pii-observability-audit',       // this script + its self-test markers
  'piiObservabilityAudit',         // the vitest self-test (intentional synthetic PII)
]

// ── PII detectors. Each is VALUE-SHAPED (matches a literal, not a field name). ─
// Patterns are deliberately conservative: they look for value LITERALS, not the
// English words. We report the CATEGORY only — never the captured text.
const DETECTORS = [
  // A-number: A followed by 8–9 digits (USCIS alien registration number).
  { category: 'a_number', re: /\bA[-\s]?\d{8,9}\b/g },
  // I-94 admission number: 11 digits, optionally with a trailing letter.
  { category: 'i94_number', re: /\b\d{11}[A-Z]?\b/g },
  // Passport / EAD-style doc number literal: 2 letters + 6–7 digits (UA passport,
  // USA EAD prefix). Excludes the synthetic 'AA000000' used in tests via self-test path skip.
  { category: 'document_number', re: /\b[A-Z]{2}\d{6,7}\b/g },
  // Date of birth shaped literal: ISO date 19xx/20xx (a value, not a schema).
  { category: 'dob_or_date', re: /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g },
  // Email address literal. Requires a real-looking TLD (2+ alpha at the end) to
  // avoid version-string false positives like "pkg@1.2.3" or "build@v4".
  { category: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g },
  // Cyrillic value literal (rawCyrillic in a log/report = a person's name/place).
  { category: 'raw_cyrillic', re: /[Ѐ-ӿ]{2,}/g },
  // US street address literal: number + street word.
  { category: 'us_address', re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl)\b/g },
]

// console.* call-site detector (any of the leaky methods).
const CONSOLE_RE = /console\.(log|info|warn|error|debug)\s*\(/

// Extensions we open as text.
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.md', '.csv', '.json', '.snap', '.txt'])

// Only these roots are "observable surfaces" we audit. (Source under apps/web/src
// for console sites; reports/briefings for tracked PII.)
const SCAN_ROOTS = ['apps/web/src', 'packages', 'scripts', 'docs/reports']
const SCAN_GLOB_FILES = [] // populated with top-level daily-briefing*.md below

function isExcludedPath(rel) {
  if (EXCLUDE_DIRS.some((d) => rel === d || rel.startsWith(d + '/'))) return true
  if (EXCLUDE_FILE_SUBSTR.some((s) => rel.includes(s))) return true
  return false
}

function* walk(absDir) {
  let entries
  try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const abs = join(absDir, e.name)
    const rel = relative(REPO_ROOT, abs)
    if (isExcludedPath(rel)) continue
    // Do NOT follow symlinked directories (real-doc/private live behind symlinks).
    let st
    try { st = statSync(abs) } catch { continue }
    if (e.isSymbolicLink && e.isSymbolicLink()) continue
    if (st.isDirectory()) { yield* walk(abs); continue }
    if (st.isFile() && TEXT_EXT.has(extname(e.name))) yield abs
  }
}

/**
 * Scan one file. Returns { rel, status, categories:Set, lines:Set } with NO values.
 * A finding requires the value-shaped pattern to appear AND, for source files,
 * within scanning distance of a console.* site OR in a report/snapshot file.
 */
function scanFile(abs) {
  const rel = relative(REPO_ROOT, abs)
  let text
  try { text = readFileSync(abs, 'utf8') } catch { return null }
  const lines = text.split('\n')
  const ext = extname(abs)
  const isSource = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(ext)
  const isReport = ['.md', '.csv', '.json', '.snap', '.txt'].includes(ext)

  const categories = new Set()
  const hitLines = new Set()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // For SOURCE files, only console-emitting lines (or their immediate args)
    // count: a value embedded in code logic is not "observable". We flag the
    // console site if a PII literal appears on the same line.
    const onConsole = isSource ? CONSOLE_RE.test(line) : false
    if (isSource && !onConsole) continue
    for (const d of DETECTORS) {
      d.re.lastIndex = 0
      if (d.re.test(line)) {
        // For reports we accept any line; for source we already gated on console.
        if (isReport || onConsole) {
          categories.add(d.category)
          hitLines.add(i + 1) // 1-based, line number ONLY (no value)
        }
      }
    }
  }
  return {
    rel,
    status: categories.size ? 'PII_PRESENT' : 'CLEAN',
    categories: [...categories].sort(),
    lines: [...hitLines].sort((a, b) => a - b),
    scanned: isSource || isReport,
  }
}

/** Build the list of files to scan from SCAN_ROOTS + top-level daily-briefing*. */
function collectTargets() {
  const targets = []
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root)
    try { if (statSync(abs).isDirectory()) for (const f of walk(abs)) targets.push(f) } catch { /* root absent */ }
  }
  // Top-level briefings / tracked reports at repo root.
  try {
    for (const e of readdirSync(REPO_ROOT, { withFileTypes: true })) {
      if (e.isFile() && /^daily-briefing.*\.md$/.test(e.name)) targets.push(join(REPO_ROOT, e.name))
    }
  } catch { /* ignore */ }
  return targets
}

export function runAudit() {
  const results = []
  for (const abs of collectTargets()) {
    const r = scanFile(abs)
    if (r && r.scanned) results.push(r)
  }
  return results
}

function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const results = runAudit().filter((r) => r.status === 'PII_PRESENT')
  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  } else {
    if (!results.length) {
      process.stdout.write('PII observability audit: CLEAN — no PII-shaped literals on observable surfaces.\n')
    } else {
      process.stdout.write('PII observability audit — findings (value-redacted):\n')
      for (const r of results) {
        process.stdout.write(`  ${r.rel}\tPII_PRESENT\t[${r.categories.join(',')}]\tlines:${r.lines.join(',')}\n`)
      }
    }
  }
  // Always exit 0 — this is a REPORT, not a build gate.
  process.exit(0)
}

// Run only when invoked directly (not when imported by the self-test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
