/**
 * noPiiLogging.test.ts — Phase 5 compliance guard (master plan §5).
 *
 * A CI grep test: NO source file may pass a PII-bearing value into a console.*
 * call. We log presence booleans, hashes, counts, and field KEYS — never the raw
 * document values (names, addresses, passport/A-numbers, DOB, phone, email,
 * signatures). This test fails the build the moment someone logs one.
 *
 * It is a deliberately conservative line-level grep (same-line console + PII
 * token), matching the plan's "CI grep test". If a real multi-line leak appears,
 * tighten this; a false positive means rename the local variable or redact first.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..') // apps/web/src

/** PII-bearing expressions that must never be interpolated into a log line. */
const FORBIDDEN = [
  /\.raw_value\b/,
  /\.normalized_value\b/,
  /\brawValue\b/,
  /\bnormalizedValue\b/,
  /profile\.(name|email|addr|address|phone)\b/,
  /\bsignerName\b/,
  /\bsignerAddress\b/,
  /\bsignatureDataUrl\b/,
  /\bcertifierAddress\b/,
]

const CONSOLE = /\bconsole\.(log|info|warn|error|debug)\s*\(/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('Phase 5 — no PII in logs (CI grep guard)', () => {
  it('no console.* call interpolates a PII-bearing value', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (!CONSOLE.test(line)) return
        if (FORBIDDEN.some((re) => re.test(line))) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}  ${line.trim().slice(0, 120)}`)
        }
      })
    }
    expect(offenders, `PII logged in console.* calls:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the guard actually detects a planted violation (self-test)', () => {
    const sample = `console.error('leak', profile.email)`
    const hit = CONSOLE.test(sample) && FORBIDDEN.some((re) => re.test(sample))
    expect(hit).toBe(true)
  })
})
