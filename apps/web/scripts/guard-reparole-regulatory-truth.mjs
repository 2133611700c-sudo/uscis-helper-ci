#!/usr/bin/env node
// guard-reparole-regulatory-truth.mjs
// Stage 7D — P3 Regulatory Guard
// Scans apps/web/src, apps/web/messages, apps/web/data for stale / wrong regulatory strings.
// Run: node scripts/guard-reparole-regulatory-truth.mjs
// Or via package.json: pnpm --filter web guard:reparole

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─────────────────────────────────────────────────────────────
// 1. Directories to scan (relative to apps/web)
// ─────────────────────────────────────────────────────────────
const SCAN_DIRS = [
  join(ROOT, 'src'),
  join(ROOT, 'messages'),
  join(ROOT, 'data'),
]

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json'])

// ─────────────────────────────────────────────────────────────
// 2. FORBIDDEN patterns — any match = FAIL
// ─────────────────────────────────────────────────────────────
const FORBIDDEN = [
  {
    pattern: /02\/27\/26/g,
    reason: 'Wrong I-131 edition date — 02/27/26 is a program announcement date, NOT a form edition. Use 01/20/25.',
  },
  {
    pattern: /June\s+9,?\s+2025/gi,
    reason: 'Stale date — "June 9, 2025" refers to a voided court order timeline. Remove.',
  },
  {
    pattern: /program\s+resumed/gi,
    reason: 'Incorrect claim — U4U re-parole program status must not be described as "resumed". Current status must be cited from uscis.gov.',
  },
  {
    pattern: /resumed\s+by\s+(federal\s+)?court\s+order/gi,
    reason: 'Incorrect claim — describing program resumption as court-ordered is not sourced. Remove.',
  },
  {
    pattern: /ELIMINATED/g,
    reason: 'Stale/incorrect label — remove "ELIMINATED" from production content.',
  },
  {
    pattern: /NO\s+LONGER\s+CORRECT/g,
    reason: 'Stale editorial marker — remove "NO LONGER CORRECT" from production content.',
  },
  {
    pattern: /\$580\b/g,
    reason: 'Hardcoded fee $580 — fees change; use "varies" or link to USCIS fee calculator.',
    skipFiles: [/guard-reparole-regulatory-truth\.mjs$/],
  },
  {
    pattern: /\$630\b/g,
    reason: 'Hardcoded fee $630 — fees change; use "varies" or link to USCIS fee calculator.',
    skipFiles: [/guard-reparole-regulatory-truth\.mjs$/],
  },
  {
    pattern: /\$1[,.]?020\b/g,
    reason: 'Hardcoded fee $1,020 / $1020 — fees change; use "varies" or link to USCIS fee calculator.',
    skipFiles: [/guard-reparole-regulatory-truth\.mjs$/],
  },
  {
    // Box 10.C is ONLINE only; "paper filing" near "10.C" is always wrong
    pattern: /paper\s+filing[^.]{0,80}10\.C|10\.C[^.]{0,80}paper\s+filing/gi,
    reason: 'Contradiction — Box 10.C is for ONLINE filing only (my.uscis.gov). Paper filing uses Part 2 Item 1.e + handwrite "Ukraine RE-PAROLE".',
    skipFiles: [
      /guard-reparole-regulatory-truth\.mjs$/,
      // i131.ts is deprecated; its "Do NOT select Part 1 Item 10.C on paper" note is intentionally explanatory
      /formIntelligence\/i131\.ts$/,
      // Screen01.tsx: correct implementation — regex false-positive from adjacent JS object properties
      // label "Box 10.C" followed by detail "Paper filing: ..." is correct (they describe different methods)
      /screens\/Screen01\.tsx$/,
    ],
  },
]

// ─────────────────────────────────────────────────────────────
// 3. REQUIRED strings — at least one file must contain each
//    (confirms the canonical truths are present in the codebase)
// ─────────────────────────────────────────────────────────────
const REQUIRED = [
  {
    pattern: /01\/20\/25/,
    reason: 'Form I-131 edition 01/20/25 must appear in at least one source file.',
  },
  {
    pattern: /Item\s+1\.e/,
    reason: '"Item 1.e" (paper re-parole selection) must appear in at least one source file.',
  },
  {
    pattern: /Box\s+10\.C/,
    reason: '"Box 10.C" (online re-parole selection) must appear in at least one source file.',
  },
  {
    pattern: /Ukraine\s+RE-PAROLE/,
    reason: '"Ukraine RE-PAROLE" (handwrite instruction for paper filing) must appear in at least one source file.',
  },
  {
    pattern: /I-134A/,
    reason: '"I-134A" (sponsor intake form, separate from I-131) must appear in at least one source file.',
  },
]

// ─────────────────────────────────────────────────────────────
// 4. File walker
// ─────────────────────────────────────────────────────────────
function* walkFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // skip node_modules, .next, .git
      if (['node_modules', '.next', '.git', 'dist', '.turbo'].includes(entry.name)) continue
      yield* walkFiles(fullPath)
    } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      yield fullPath
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Main scan
// ─────────────────────────────────────────────────────────────
let totalErrors = 0
const requiredHits = new Map(REQUIRED.map((r) => [r.pattern.toString(), false]))

for (const dir of SCAN_DIRS) {
  for (const filePath of walkFiles(dir)) {
    let content
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    // Track required patterns
    for (const req of REQUIRED) {
      if (!requiredHits.get(req.pattern.toString()) && req.pattern.test(content)) {
        requiredHits.set(req.pattern.toString(), true)
      }
    }

    // Check forbidden patterns
    for (const rule of FORBIDDEN) {
      // Reset lastIndex for global regexes
      rule.pattern.lastIndex = 0

      // Skip files matching rule.skipFiles
      if (rule.skipFiles?.some((skip) => skip.test(filePath))) continue

      let match
      while ((match = rule.pattern.exec(content)) !== null) {
        const lineNum = content.slice(0, match.index).split('\n').length
        const rel = filePath.replace(ROOT + '/', '')
        console.error(`\n❌ FORBIDDEN  ${rel}:${lineNum}`)
        console.error(`   Match:    "${match[0]}"`)
        console.error(`   Reason:   ${rule.reason}`)
        totalErrors++

        // Prevent infinite loop for zero-length matches
        if (match.index === rule.pattern.lastIndex) rule.pattern.lastIndex++
      }
      // Reset after use
      rule.pattern.lastIndex = 0
    }
  }
}

// Check required strings were found
for (const req of REQUIRED) {
  if (!requiredHits.get(req.pattern.toString())) {
    console.error(`\n❌ REQUIRED MISSING`)
    console.error(`   Pattern: ${req.pattern}`)
    console.error(`   Reason:  ${req.reason}`)
    totalErrors++
  }
}

// ─────────────────────────────────────────────────────────────
// 6. Result
// ─────────────────────────────────────────────────────────────
if (totalErrors === 0) {
  console.log('\n✅  guard-reparole-regulatory-truth: PASS — no violations found.')
  process.exit(0)
} else {
  console.error(`\n💥  guard-reparole-regulatory-truth: FAIL — ${totalErrors} violation(s) found. Fix before merging.`)
  process.exit(1)
}
